/**
 * 组件属性配置选项
 */
export interface PropOption {
  /** 属性名，对应 HTML attribute */
  name: string;
  /** 属性类型 */
  type?: 'string' | 'number' | 'boolean' | 'object';
  /** 是否必填 */
  required?: boolean;
  /** 默认值 */
  default?: any;
}

/**
 * 组件声明配置
 * 用于描述组件模板、样式、属性监听和 Shadow DOM 行为
 */
export interface ComponentManifest {
  /** HTML 模板字符串或模板函数 */
  template?: string | Function;
  /** 组件样式（CSS 字符串） */
  styles?: string;
  /** 支持的属性列表 */
  props?: Array<string | PropOption>;
  /** Shadow DOM 配置 */
  shadowDOM?: { 
    /** 是否使用 Shadow DOM */
    use: boolean; 
    /** Shadow DOM 模式 */
    mode?: "open" | "closed" 
  };
  /** 组件根元素类名 */
  className?: string;
  /** 注册的自定义元素标签名 */
  tagName: string;
  /** 内部使用的配置标记 */
  hasConfig?: boolean;
}

/**
 * 组件生命周期钩子接口
 */
export interface ComponentLifecycle {
  /** 组件创建完成（构造函数结束时调用） */
  created?(): void;
  /** 组件首次挂载到 DOM 后调用 */
  mounted?(): void;
  /** 每次更新前调用 */
  beforeUpdate?(): void;
  /** 每次更新完成后调用 */
  updated?(): void;
  /** 组件从 DOM 中卸载时调用 */
  unmounted?(): void;
  /** 兼容旧组件的初始化钩子（首次 mounted 后调用） */
  onInit?(): void | Promise<void>;
}

/**
 * BaseElement 泛型接口
 */
export interface IBaseElement<TData = any> extends HTMLElement, ComponentLifecycle {
  /** 组件配置 */
  _manifest: ComponentManifest;
  /** 组件数据 */
  $data: TData;
  /** 手动刷新组件 */
  refresh(): void;
}