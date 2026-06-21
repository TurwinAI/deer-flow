/**
 * Firestore-backed LangGraph checkpointer.
 *
 * Mirrors the semantics of the in-repo `MemorySaver`
 * (`@langchain/langgraph-checkpoint`): same key model `(thread_id,
 * checkpoint_ns, checkpoint_id)`, same serde (`dumpsTyped`/`loadsTyped`), same
 * `getTuple`/`list`/`put`/`putWrites` contract. The only difference is the
 * backing store: two Firestore collections instead of in-memory maps.
 *
 * Storage layout:
 *   - `checkpoints/{docId}`        — one doc per checkpoint
 *   - `checkpoint_writes/{docId}`  — one doc per (taskId, idx) write
 * where `docId` is a deterministic base64url of the JSON key tuple, so a put
 * for the same key is idempotent (overwrites).
 *
 * Limitation (documented for B03): `pending_sends` is not persisted. The
 * `MemorySaver` reconstructs pending sends from the parent checkpoint's writes
 * tagged with the `TASKS` channel; for B03 we keep `pending_sends` empty on
 * read. This is sufficient for the lead-agent tool-calling loop (single graph,
 * no Send-based fan-out) but should be revisited if subagent fan-out is added.
 */
import type { RunnableConfig } from "@langchain/core/runnables";
import {
  BaseCheckpointSaver,
  copyCheckpoint,
  getCheckpointId,
  WRITES_IDX_MAP,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
} from "@langchain/langgraph-checkpoint";
import type { Firestore } from "firebase-admin/firestore";
import { getDb } from "./firestore";

const CHECKPOINTS = "checkpoints";
const CHECKPOINT_WRITES = "checkpoint_writes";

interface CheckpointDoc {
  threadId: string;
  checkpointNs: string;
  checkpointId: string;
  parentCheckpointId?: string;
  checkpointB64: string;
  metadataB64: string;
}

interface WriteDoc {
  threadId: string;
  checkpointNs: string;
  checkpointId: string;
  taskId: string;
  idx: number;
  channel: string;
  valueB64: string;
}

/** Deterministic base64url document id from the 3-part checkpoint key. */
function checkpointDocId(
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
): string {
  const json = JSON.stringify([threadId, checkpointNs, checkpointId]);
  return Buffer.from(json).toString("base64url");
}

/** Deterministic document id for a single intermediate write. */
function writeDocId(
  threadId: string,
  checkpointNs: string,
  checkpointId: string,
  taskId: string,
  idx: number,
): string {
  const json = JSON.stringify([
    threadId,
    checkpointNs,
    checkpointId,
    taskId,
    idx,
  ]);
  return Buffer.from(json).toString("base64url");
}

function encode(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function decode(b64: string): Buffer {
  return Buffer.from(b64, "base64");
}

export class FirestoreCheckpointSaver extends BaseCheckpointSaver {
  private readonly db: Firestore;

  constructor(db?: Firestore) {
    super();
    this.db = db ?? getDb();
  }

  /** Load all writes for a checkpoint key, ordered by idx, as pendingWrites. */
  private async loadPendingWrites(
    threadId: string,
    checkpointNs: string,
    checkpointId: string,
  ): Promise<[string, string, unknown][]> {
    const snap = await this.db
      .collection(CHECKPOINT_WRITES)
      .where("threadId", "==", threadId)
      .where("checkpointNs", "==", checkpointNs)
      .where("checkpointId", "==", checkpointId)
      .get();

    const docs = snap.docs
      .map((d) => d.data() as WriteDoc)
      .sort((a, b) => a.idx - b.idx);

    const result: [string, string, unknown][] = [];
    for (const w of docs) {
      const value = await this.serde.loadsTyped("json", decode(w.valueB64));
      result.push([w.taskId, w.channel, value]);
    }
    return result;
  }

  private async toTuple(doc: CheckpointDoc): Promise<CheckpointTuple> {
    const deserialized = await this.serde.loadsTyped(
      "json",
      decode(doc.checkpointB64),
    );
    const metadata = (await this.serde.loadsTyped(
      "json",
      decode(doc.metadataB64),
    )) as CheckpointMetadata;

    const checkpoint: Checkpoint = {
      ...deserialized,
      // B03 limitation: pending_sends is not persisted; see file header.
      pending_sends: [],
    };

    const pendingWrites = await this.loadPendingWrites(
      doc.threadId,
      doc.checkpointNs,
      doc.checkpointId,
    );

    const tuple: CheckpointTuple = {
      config: {
        configurable: {
          thread_id: doc.threadId,
          checkpoint_ns: doc.checkpointNs,
          checkpoint_id: doc.checkpointId,
        },
      },
      checkpoint,
      metadata,
      pendingWrites,
    };

    if (doc.parentCheckpointId !== undefined) {
      tuple.parentConfig = {
        configurable: {
          thread_id: doc.threadId,
          checkpoint_ns: doc.checkpointNs,
          checkpoint_id: doc.parentCheckpointId,
        },
      };
    }

    return tuple;
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const threadId = config.configurable?.thread_id as string | undefined;
    if (threadId === undefined) {
      return undefined;
    }
    const checkpointNs = (config.configurable?.checkpoint_ns ?? "") as string;
    const checkpointId = getCheckpointId(config);

    if (checkpointId) {
      const docId = checkpointDocId(threadId, checkpointNs, checkpointId);
      const snap = await this.db.collection(CHECKPOINTS).doc(docId).get();
      if (!snap.exists) {
        return undefined;
      }
      return this.toTuple(snap.data() as CheckpointDoc);
    }

    // No checkpoint id: load the latest for the thread/ns (highest id).
    const snap = await this.db
      .collection(CHECKPOINTS)
      .where("threadId", "==", threadId)
      .where("checkpointNs", "==", checkpointNs)
      .get();
    if (snap.empty) {
      return undefined;
    }
    const docs = snap.docs
      .map((d) => d.data() as CheckpointDoc)
      .sort((a, b) => b.checkpointId.localeCompare(a.checkpointId));
    return this.toTuple(docs[0]);
  }

  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    const { before, limit } = options ?? {};
    const threadId = config.configurable?.thread_id as string | undefined;

    let query = this.db.collection(CHECKPOINTS) as FirebaseFirestore.Query;
    if (threadId !== undefined) {
      query = query.where("threadId", "==", threadId);
    }
    const configNs = config.configurable?.checkpoint_ns as string | undefined;
    if (configNs !== undefined) {
      query = query.where("checkpointNs", "==", configNs);
    }

    const snap = await query.get();
    const docs = snap.docs
      .map((d) => d.data() as CheckpointDoc)
      // newest first
      .sort((a, b) => b.checkpointId.localeCompare(a.checkpointId));

    const beforeId = before?.configurable?.checkpoint_id as string | undefined;
    let remaining = limit;

    for (const doc of docs) {
      if (beforeId !== undefined && doc.checkpointId >= beforeId) {
        continue;
      }
      if (remaining !== undefined) {
        if (remaining <= 0) break;
        remaining -= 1;
      }
      yield this.toTuple(doc);
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const threadId = config.configurable?.thread_id as string | undefined;
    const checkpointNs = (config.configurable?.checkpoint_ns ?? "") as string;
    if (threadId === undefined) {
      throw new Error(
        `Failed to put checkpoint. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property.`,
      );
    }

    const preparedCheckpoint = copyCheckpoint(checkpoint);
    delete (preparedCheckpoint as Partial<Checkpoint>).pending_sends;

    const [, checkpointBytes] = this.serde.dumpsTyped(preparedCheckpoint);
    const [, metadataBytes] = this.serde.dumpsTyped(metadata);

    const parentCheckpointId = config.configurable?.checkpoint_id as
      | string
      | undefined;

    const doc: CheckpointDoc = {
      threadId,
      checkpointNs,
      checkpointId: checkpoint.id,
      checkpointB64: encode(checkpointBytes),
      metadataB64: encode(metadataBytes),
    };
    if (parentCheckpointId !== undefined) {
      doc.parentCheckpointId = parentCheckpointId;
    }

    const docId = checkpointDocId(threadId, checkpointNs, checkpoint.id);
    await this.db.collection(CHECKPOINTS).doc(docId).set(doc);

    return {
      configurable: {
        thread_id: threadId,
        checkpoint_ns: checkpointNs,
        checkpoint_id: checkpoint.id,
      },
    };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
  ): Promise<void> {
    const threadId = config.configurable?.thread_id as string | undefined;
    const checkpointNs = (config.configurable?.checkpoint_ns ?? "") as string;
    const checkpointId = config.configurable?.checkpoint_id as
      | string
      | undefined;
    if (threadId === undefined) {
      throw new Error(
        `Failed to put writes. The passed RunnableConfig is missing a required "thread_id" field in its "configurable" property`,
      );
    }
    if (checkpointId === undefined) {
      throw new Error(
        `Failed to put writes. The passed RunnableConfig is missing a required "checkpoint_id" field in its "configurable" property.`,
      );
    }

    const batch = this.db.batch();
    writes.forEach(([channel, value], idx) => {
      const resolvedIdx = WRITES_IDX_MAP[channel] ?? idx;
      const [, valueBytes] = this.serde.dumpsTyped(value);
      const writeDoc: WriteDoc = {
        threadId,
        checkpointNs,
        checkpointId,
        taskId,
        idx: resolvedIdx,
        channel,
        valueB64: encode(valueBytes),
      };
      const docId = writeDocId(
        threadId,
        checkpointNs,
        checkpointId,
        taskId,
        resolvedIdx,
      );
      batch.set(this.db.collection(CHECKPOINT_WRITES).doc(docId), writeDoc);
    });
    await batch.commit();
  }
}
