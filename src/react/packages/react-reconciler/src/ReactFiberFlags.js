/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import {enableCreateEventHandleAPI} from 'shared/ReactFeatureFlags';

export type Flags = number;

// Don't change these two values. They're used by React Dev Tools.
export const NoFlags = /*                      */ 0b00000000000000000000000000; // 表示没有任何标志或副作用
export const PerformedWork = /*                */ 0b00000000000000000000000001; // DevTools 使用, 表示该 Fiber 参与了本次渲染

// You can change the rest (and add more).
export const Placement = /*                    */ 0b00000000000000000000000010; // 标记一个 DOM 节点需要被插入到页面中
export const Update = /*                       */ 0b00000000000000000000000100; // 标记一个 DOM 节点或组件需要更新
export const Deletion = /*                     */ 0b00000000000000000000001000; // 标记一个 DOM 节点需要被从页面中删除
export const ChildDeletion = /*                */ 0b00000000000000000000010000; // 标记一个 DOM 节点需要被从页面中删除
export const ContentReset = /*                 */ 0b00000000000000000000100000; // 
export const Callback = /*                     */ 0b00000000000000000001000000; // 标记需要执行 setState 的回调参数
export const DidCapture = /*                   */ 0b00000000000000000010000000; // 标记一个 Error Boundary 已经捕获了一个错误, 正在渲染降级 UI
export const ForceClientRender = /*            */ 0b00000000000000000100000000; // 
export const Ref = /*                          */ 0b00000000000000001000000000; // 标记需要处理 ref 的附加或解绑
export const Snapshot = /*                     */ 0b00000000000000010000000000; // 标记 Class 组件需要在提交阶段前执行 getSnapshotBeforeUpdate 生命周期方法
export const Passive = /*                      */ 0b00000000000000100000000000; // 标记 Fiber 的 useEffect 或 useLayoutEffect Hook 需要被执行 (重要‼️)
export const Hydrating = /*                    */ 0b00000000000001000000000000; // 
export const Visibility = /*                   */ 0b00000000000010000000000000; // 
export const StoreConsistency = /*             */ 0b00000000000100000000000000; // 

export const LifecycleEffectMask =
  Passive | Update | Callback | Ref | Snapshot | StoreConsistency;

// Union of all commit flags (flags with the lifetime of a particular commit)
export const HostEffectMask = /*               */ 0b00000000000111111111111111; // 代表单次提交中所有需要处理的副作用的集合. 提交阶段只处理带此掩码的标志

// These are not really side effects, but we still reuse this field.
export const Incomplete = /*                   */ 0b00000000001000000000000000; // 标记 Fiber 的渲染过程未完成 (例如: 因抛出错误而中断)
export const ShouldCapture = /*                */ 0b00000000010000000000000000; // 标记一个 Error Boundary 应该捕获并处理子树中抛出的错误
export const ForceUpdateForLegacySuspense = /* */ 0b00000000100000000000000000;
export const DidPropagateContext = /*          */ 0b00000001000000000000000000;
export const NeedsPropagation = /*             */ 0b00000010000000000000000000;
export const Forked = /*                       */ 0b00000100000000000000000000;

// Static tags describe aspects of a fiber that are not specific to a render,
// e.g. a fiber uses a passive effect (even if there are no updates on this particular render).
// This enables us to defer more work in the unmount case,
// since we can defer traversing the tree during layout to look for Passive effects,
// and instead rely on the static flag as a signal that there may be cleanup work.
export const RefStatic = /*                    */ 0b00001000000000000000000000;
export const LayoutStatic = /*                 */ 0b00010000000000000000000000;
export const PassiveStatic = /*                */ 0b00100000000000000000000000; // 表示该 Fiber 使用了 useEffect Hook, 即使在某次渲染中无更新也需在卸载时清理

// These flags allow us to traverse to fibers that have effects on mount
// without traversing the entire tree after every commit for
// double invoking
// 开发模式专用
export const MountLayoutDev = /*               */ 0b01000000000000000000000000; // 用于在严格模式下"双重调用"渲染阶段生命周期方法以检测副作用
export const MountPassiveDev = /*              */ 0b10000000000000000000000000; // 用于在严格模式下"双重调用" useEffect 以检测副作用

// Groups of flags that are used in the commit phase to skip over trees that
// don't contain effects, by checking subtreeFlags.

export const BeforeMutationMask =
  // TODO: Remove Update flag from before mutation phase by re-landing Visibility
  // flag logic (see #20043)
  Update |
  Snapshot |
  (enableCreateEventHandleAPI
    ? // createEventHandle needs to visit deleted and hidden trees to
      // fire beforeblur
      // TODO: Only need to visit Deletions during BeforeMutation phase if an
      // element is focused.
      ChildDeletion | Visibility
    : 0);

export const MutationMask =
  Placement |
  Update |
  ChildDeletion |
  ContentReset |
  Ref |
  Hydrating |
  Visibility;
export const LayoutMask = Update | Callback | Ref | Visibility;

// TODO: Split into PassiveMountMask and PassiveUnmountMask
export const PassiveMask = Passive | ChildDeletion;

// Union of tags that don't get reset on clones.
// This allows certain concepts to persist without recalculating them,
// e.g. whether a subtree contains passive effects or portals.
export const StaticMask = LayoutStatic | PassiveStatic | RefStatic;
