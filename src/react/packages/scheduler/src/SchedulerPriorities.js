/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

export type PriorityLevel = 0 | 1 | 2 | 3 | 4 | 5; // 类型定义: 用于标识任务的优先级 (数字越小优先级越高, 0 表示没有优先级)

// TODO: Use symbols? /* 表示未来可能会考虑用符号 (Symbol: 可以用来创建唯一的、不可变的值) 来替代这些常量 */
export const NoPriority = 0;           // 表示没有优先级的任务, 值为 0
export const ImmediatePriority = 1;    // 表示最高优先级的任务, 值为 1
export const UserBlockingPriority = 2; // 表示用户交互相关的高优先级任务, 值为 2
export const NormalPriority = 3;       // 表示普通优先级的任务, 值为 3
export const LowPriority = 4;          // 表示低优先级的任务, 值为 4
export const IdlePriority = 5;         // 表示空闲优先级的任务, 值为 5
