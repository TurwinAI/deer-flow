/**
 * Tool system. Mirrors DeerFlow's `deerflow/tools`.
 * Built-in tools land in B02; the label-operation tools the agent uses to run
 * the catalog/orders/Polar autonomously land in B05/B06.
 */
export interface ToolSpec {
  name: string;
  description: string;
}
