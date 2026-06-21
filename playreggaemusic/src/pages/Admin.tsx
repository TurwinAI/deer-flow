/**
 * Owner-only admin console (B07).
 *
 * Gated behind the `isAdmin` custom claim (via `watchAdminSession`). A non-admin
 * sees a sign-in prompt; the owner sees CRUD forms for artists/releases/products
 * plus an orders/revenue view. All data flows through `src/lib/admin`, which is
 * in-memory in fixtures mode and admin-guarded callables in production.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  createArtist,
  createProduct,
  createRelease,
  listAdminArtists,
  listAdminProducts,
  listAdminReleases,
  listOrders,
} from "../lib/admin";
import { watchAdminSession, type AdminSession } from "../lib/auth";
import type { Artist, Order, Product, Release } from "../lib/catalog";

function ArtistForm({ onCreated }: { onCreated: () => void }) {
  const [id, setId] = useState("");
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await createArtist({ id, name, bio });
    setStatus(`Saved artist ${id}.`);
    setId("");
    setName("");
    setBio("");
    onCreated();
  }

  return (
    <form onSubmit={submit} aria-label="Create or update artist">
      <h3>New artist</h3>
      <label>
        ID (slug)
        <input value={id} onChange={(e) => setId(e.target.value)} required name="artist-id" />
      </label>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required name="artist-name" />
      </label>
      <label>
        Bio
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} name="artist-bio" />
      </label>
      <button type="submit">Save artist</button>
      {status && <p role="status">{status}</p>}
    </form>
  );
}

function ReleaseForm({ onCreated }: { onCreated: () => void }) {
  const [id, setId] = useState("");
  const [artistId, setArtistId] = useState("");
  const [title, setTitle] = useState("");
  const [catalogNumber, setCatalogNumber] = useState("");
  const [type, setType] = useState<Release["type"]>("ep");
  const [releaseDate, setReleaseDate] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await createRelease({ id, artistId, title, catalogNumber, type, releaseDate });
    setStatus(`Saved release ${id}.`);
    onCreated();
  }

  return (
    <form onSubmit={submit} aria-label="Create or update release">
      <h3>New release</h3>
      <label>
        ID
        <input value={id} onChange={(e) => setId(e.target.value)} required name="release-id" />
      </label>
      <label>
        Artist ID
        <input
          value={artistId}
          onChange={(e) => setArtistId(e.target.value)}
          required
          name="release-artist"
        />
      </label>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required name="release-title" />
      </label>
      <label>
        Catalog number
        <input
          value={catalogNumber}
          onChange={(e) => setCatalogNumber(e.target.value)}
          required
          name="release-catalog"
        />
      </label>
      <label>
        Type
        <select value={type} onChange={(e) => setType(e.target.value as Release["type"])} name="release-type">
          <option value="album">album</option>
          <option value="ep">ep</option>
          <option value="single">single</option>
        </select>
      </label>
      <label>
        Release date
        <input
          value={releaseDate}
          onChange={(e) => setReleaseDate(e.target.value)}
          required
          name="release-date"
          placeholder="2026-09-01"
        />
      </label>
      <button type="submit">Save release</button>
      {status && <p role="status">{status}</p>}
    </form>
  );
}

function ProductForm({ onCreated }: { onCreated: () => void }) {
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [priceCents, setPriceCents] = useState("700");
  const [releaseId, setReleaseId] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await createProduct({
      id,
      type: "music_download",
      title,
      priceCents: Number(priceCents),
      currency: "USD",
      releaseId: releaseId || undefined,
    });
    setStatus(`Saved product ${id}.`);
    onCreated();
  }

  return (
    <form onSubmit={submit} aria-label="Create or update product">
      <h3>New product</h3>
      <label>
        ID
        <input value={id} onChange={(e) => setId(e.target.value)} required name="product-id" />
      </label>
      <label>
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} required name="product-title" />
      </label>
      <label>
        Price (cents)
        <input
          value={priceCents}
          onChange={(e) => setPriceCents(e.target.value)}
          type="number"
          min="0"
          name="product-price"
        />
      </label>
      <label>
        Release ID
        <input value={releaseId} onChange={(e) => setReleaseId(e.target.value)} name="product-release" />
      </label>
      <button type="submit">Save product</button>
      {status && <p role="status">{status}</p>}
    </form>
  );
}

export default function Admin() {
  const [session, setSession] = useState<AdminSession | null | undefined>(undefined);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [releases, setReleases] = useState<Release[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => watchAdminSession(setSession), []);

  async function refresh() {
    const [a, r, p, o] = await Promise.all([
      listAdminArtists(),
      listAdminReleases(),
      listAdminProducts(),
      listOrders(),
    ]);
    setArtists(a);
    setReleases(r);
    setProducts(p);
    setOrders(o);
  }

  useEffect(() => {
    if (session?.isAdmin) void refresh();
  }, [session?.isAdmin]);

  if (session === undefined) return <p>Checking access…</p>;
  if (!session || !session.isAdmin) {
    return (
      <section aria-labelledby="admin-denied">
        <h1 id="admin-denied">Admin sign-in required</h1>
        <p>This area is owner-only. Sign in with an admin account to continue.</p>
      </section>
    );
  }

  const revenueCents = orders
    .filter((o) => o.status === "paid")
    .reduce((sum, o) => sum + o.amount, 0);

  return (
    <section aria-labelledby="admin-heading">
      <h1 id="admin-heading">Admin console</h1>
      <p>
        Signed in as {session.email ?? session.uid}.{" "}
        <Link to="/admin/agent">Open the agent console →</Link>
      </p>
      <nav aria-label="Admin sections" className="admin-nav">
        <Link to="/admin/approvals">Pending approvals</Link>
        {" · "}
        <Link to="/admin/distribution">Distribution status</Link>
        {" · "}
        <Link to="/admin/royalties">Royalty statements</Link>
      </nav>

      <h2>Catalog</h2>
      <div className="admin-forms">
        <ArtistForm onCreated={refresh} />
        <ReleaseForm onCreated={refresh} />
        <ProductForm onCreated={refresh} />
      </div>

      <h2>Current catalog</h2>
      <ul aria-label="Artists">
        {artists.map((a) => (
          <li key={a.id}>{a.name}</li>
        ))}
      </ul>
      <ul aria-label="Releases">
        {releases.map((r) => (
          <li key={r.id}>
            {r.title} ({r.catalogNumber})
          </li>
        ))}
      </ul>
      <ul aria-label="Products">
        {products.map((p) => (
          <li key={p.id}>
            {p.title} — {(p.priceCents / 100).toFixed(2)} {p.currency}
          </li>
        ))}
      </ul>

      <h2 id="orders-heading">Orders &amp; revenue</h2>
      <p>
        Paid revenue: <strong>{(revenueCents / 100).toFixed(2)} USD</strong> across{" "}
        {orders.length} order(s).
      </p>
      <table aria-labelledby="orders-heading">
        <thead>
          <tr>
            <th scope="col">Order</th>
            <th scope="col">Product</th>
            <th scope="col">Amount</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td>{o.id}</td>
              <td>{o.productId}</td>
              <td>
                {(o.amount / 100).toFixed(2)} {o.currency}
              </td>
              <td>{o.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
