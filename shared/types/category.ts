/**
 * 游戏分类接口
 *
 * 前后端共享的统一定义。
 */
export interface Category {
    /** 分类唯一标识 */
    id: string
    /** 分类名称 */
    name: string
    /** 父分类 ID（保留层级扩展能力） */
    parentId?: string
    /**
     * 自动分类规则
     * 存储正则表达式字符串，用于匹配游戏名或进程名
     */
    rules?: string[]
    /** 分类图标 URL 或 Base64 */
    icon?: string
    /** 排序权重，越小越靠前 */
    order?: number
}
