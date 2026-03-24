/** 源代码位置 [行, 列] */
export type SourceLocation = [number, number];

/** AST 属性节点 */
export interface Attribute {
    key: string;
    value: string;
    loc: SourceLocation;
    /**
     * 执行语义角色（Execution Role）
     *
     * - model:
     *   数据同步语义（如 s-model / v-model 展开）
     *   必须在同一事件中最先执行，
     *   以保证用户事件观察到的是最新数据状态
     *
     * - user:
     *   用户显式声明的事件处理逻辑（@click / @input 等）
     *   在 model 同步完成后执行
     */
    role?: 'model' | 'user';
}

/** AST 节点类型枚举 */
export enum ASTType {
    Element = 0,
    Text = 1,
    Comment = 2,
    If = 3,
    ElseIf = 4,
    Else = 5,
    For = 6,
    Conditional = 7, // if-elseif-else 结构
    Other = 99,
}

/** AST 节点 */
export interface ASTNode {
    type: ASTType;
    tag: string;      // 只有 Element 用
    loc: SourceLocation; // 位置
    children?: ASTNode[];
    attrs?: Attribute[];     // 所有属性统一在这里！
    content?: string;        // 只有文本/注释用
}