/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

'use strict';

import type {ReactNodeList} from 'shared/ReactTypes';
import type {
  RootType,
  HydrateRootOptions,
  CreateRootOptions,
} from './src/client/ReactDOMRoot';

import {
  createRoot as createRootImpl,
  hydrateRoot as hydrateRootImpl,
  __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED as Internals,
} from './';

/**
 * 创建React应用的根节点(FiberRoot), 用于管理组件树的渲染
 * 
 * @param {Element | Document | DocumentFragment} container - 挂载React应用的DOM容器
 * @param {Object} [options] - 可选的配置对象
 * @param {boolean} [options.unstable_strictMode] - 是否启用严格模式 (实验性功能)
 * @param {boolean} [options.unstable_concurrentUpdatesByDefault] - 是否默认启用并发更新 (实验性功能)
 * @param {Function} [options.onRecoverableError] - 可恢复错误处理函数
 * @param {string} [options.identifierPrefix] - 服务端渲染使用的ID前缀
 * @param {Object} [options.transitionCallbacks] - 过渡更新的回调函数对象
 * @returns {ReactDOMRoot} React根节点对象, 包含render和unmount方法
 */
export function createRoot(
  container: Element | Document | DocumentFragment,
  options?: CreateRootOptions,
): RootType {
  // 开发环境下标记当前处于客户端入口点 (如浏览器环境)
  if (__DEV__) {
    Internals.usingClientEntryPoint = true;
  }
  try {
    // 应用的根节点(FiberRoot)
    return createRootImpl(container, options);
  } finally {
    // 开发环境下重置内部标记
    if (__DEV__) {
      Internals.usingClientEntryPoint = false;
    }
  }
}

export function hydrateRoot(
  container: Document | Element,
  children: ReactNodeList,
  options?: HydrateRootOptions,
): RootType {
  if (__DEV__) {
    Internals.usingClientEntryPoint = true;
  }
  try {
    return hydrateRootImpl(container, children, options);
  } finally {
    if (__DEV__) {
      Internals.usingClientEntryPoint = false;
    }
  }
}
