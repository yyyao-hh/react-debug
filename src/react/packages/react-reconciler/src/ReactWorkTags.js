// 用于标识 React 中 Fiber 节点的类型 (即 FiberNode 中的 tag 属性)
export type WorkTag =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18
  | 19
  | 20
  | 21
  | 22
  | 23
  | 24
  | 25;

export const FunctionComponent = 0;           // 函数组件
export const ClassComponent = 1;              // 类组件
export const IndeterminateComponent = 2;      // 尚未确定是函数组件还是类组件 (在初次渲染时使用)
export const HostRoot = 3;                    // 根节点 (ReactDOM.render 挂载点)
export const HostPortal = 4;                  // Portal 节点 (由 ReactDOM.createPortal 创建)
export const HostComponent = 5;               // 原生 DOM 元素 (div/span等)
export const HostText = 6;                    // 文本节点
export const Fragment = 7;                    // <React.Fragment>
export const Mode = 8;                        // <React.StrictMode>
export const ContextConsumer = 9;             // Context 消费者
export const ContextProvider = 10;            // Context 提供者
export const ForwardRef = 11;                 // React.forwardRef 组件
export const Profiler = 12;                   // <Profiler> 组件 (用于性能分析)
export const SuspenseComponent = 13;          // <Suspense> 组件
export const MemoComponent = 14;              // React.memo 包装的组件
export const SimpleMemoComponent = 15;        // 简单函数组件的 memo 版本
export const LazyComponent = 16;              // React.lazy 加载的组件
export const IncompleteClassComponent = 17;   // 未完成渲染的类组件 (可能由于错误或挂起)
export const DehydratedFragment = 18;         // 脱水片段 (SSR相关)
export const SuspenseListComponent = 19;      // <SuspenseList> 组件 (管理多个Suspense组件的显示顺序)
export const ScopeComponent = 21;             // 作用域组件 (实验性特性)
export const OffscreenComponent = 22;         // 离屏组件 (用于隐藏内容但保持渲染)
export const LegacyHiddenComponent = 23;      // 旧版隐藏组件 (用于预渲染隐藏内容)
export const CacheComponent = 24;             // 缓存组件 (实验性特性)
export const TracingMarkerComponent = 25;     // 性能追踪标记组件
