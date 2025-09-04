/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type RootTag = 0 | 1;

// 定义两种根类型常量
export const LegacyRoot = 0;     // 传统同步模式
export const ConcurrentRoot = 1; // 并发模式
