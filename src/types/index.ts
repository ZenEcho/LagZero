export interface Game {
    id?: string
    name: string
    iconUrl?: string
    processName: string | string[]
    category: string
    tags?: string[]
    profileId?: string
    lastPlayed?: number
    status?: 'idle' | 'accelerating'
    latency?: number
    nodeId?: string
    proxyMode?: 'process' | 'routing'
    routingRules?: string[]
    chainProxy?: boolean
}

export interface Category {
    id: string
    name: string
    parentId?: string
    rules?: string[]
    icon?: string
    order?: number
}
