import type { NodeConfig } from '@/types'

export const nodeApi = {
  getAll: () => window.nodes.getAll(),
  save: (node: NodeConfig) => window.nodes.save(node),
  delete: (id: string) => window.nodes.delete(id),
  import: (nodes: NodeConfig[]) => window.nodes.import(nodes),
}
