/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 */

/* eslint-disable no-var */

import {
  enableSchedulerDebugging,
  enableProfiling,
  enableIsInputPending,
  enableIsInputPendingContinuous,
  frameYieldMs,
  continuousYieldMs,
  maxYieldMs,
} from '../SchedulerFeatureFlags';

import {push, pop, peek} from '../SchedulerMinHeap';

// TODO: Use symbols?
import {
  ImmediatePriority,
  UserBlockingPriority,
  NormalPriority,
  LowPriority,
  IdlePriority,
} from '../SchedulerPriorities';
import {
  markTaskRun,
  markTaskYield,
  markTaskCompleted,
  markTaskCanceled,
  markTaskErrored,
  markSchedulerSuspended,
  markSchedulerUnsuspended,
  markTaskStart,
  stopLoggingProfilingEvents,
  startLoggingProfilingEvents,
} from '../SchedulerProfiling';

let getCurrentTime;
const hasPerformanceNow =
  typeof performance === 'object' && typeof performance.now === 'function';

if (hasPerformanceNow) {
  const localPerformance = performance;
  getCurrentTime = () => localPerformance.now();
} else {
  const localDate = Date;
  const initialTime = localDate.now();
  getCurrentTime = () => localDate.now() - initialTime;
}

// Max 31 bit integer. The max integer size in V8 for 32-bit systems.
// Math.pow(2, 30) - 1
// 0b111111111111111111111111111111
var maxSigned31BitInt = 1073741823;

// Times out immediately
var IMMEDIATE_PRIORITY_TIMEOUT = -1;
// Eventually times out
var USER_BLOCKING_PRIORITY_TIMEOUT = 250;
var NORMAL_PRIORITY_TIMEOUT = 5000;
var LOW_PRIORITY_TIMEOUT = 10000;
// Never times out
var IDLE_PRIORITY_TIMEOUT = maxSigned31BitInt;

// Tasks are stored on a min heap
var taskQueue = [];
var timerQueue = [];

// Incrementing id counter. Used to maintain insertion order.
var taskIdCounter = 1;

// Pausing the scheduler is useful for debugging.
var isSchedulerPaused = false;

var currentTask = null;
var currentPriorityLevel = NormalPriority;

// This is set while performing work, to prevent re-entrance.
var isPerformingWork = false;

var isHostCallbackScheduled = false;
var isHostTimeoutScheduled = false;

// Capture local references to native APIs, in case a polyfill overrides them.
const localSetTimeout = typeof setTimeout === 'function' ? setTimeout : null;
const localClearTimeout =
  typeof clearTimeout === 'function' ? clearTimeout : null;
const localSetImmediate =
  typeof setImmediate !== 'undefined' ? setImmediate : null; // IE and Node.js + jsdom

const isInputPending =
  typeof navigator !== 'undefined' &&
  navigator.scheduling !== undefined &&
  navigator.scheduling.isInputPending !== undefined
    ? navigator.scheduling.isInputPending.bind(navigator.scheduling)
    : null;

const continuousOptions = {includeContinuous: enableIsInputPendingContinuous};

/**
 * 检查定时器队列(timerQueue)中已到期的任务, 并将其转移到主任务队列(taskQueue)中
 * 
 * @param {number} currentTime - 当前调度器的时间戳
 */
function advanceTimers(currentTime) {
  let timer = peek(timerQueue); // 从定时器队列获取队头任务 (不弹出)

  // 遍历定时器队列(timerQueue), 检查到期的任务并将其添加到主任务队列(taskQueue)中
  while (timer !== null) {
    // 情况1: 任务已执行, 将其从定时器队列中弹出 (回调为空)
    if (timer.callback === null) {
      pop(timerQueue);
    // 情况2: 任务已到期, 将任务从定时器队列转移到主任务队列 (定时器开始时间 <= 当前时间)
    } else if (timer.startTime <= currentTime) {
      pop(timerQueue);
      timer.sortIndex = timer.expirationTime; // 设置排序依据为过期时间
      push(taskQueue, timer);
      if (enableProfiling) { // 性能分析
        markTaskStart(timer, currentTime); // 标记任务开始时间
        timer.isQueued = true; // 设置入队标志
      }
    // 情况3: 定时器尚未到期, 终止遍历 (由于定时器队列是按开始时间排序的最小堆, 后续任务都未到期)
    } else {
      return;
    }
    timer = peek(timerQueue); // 获取队列中下一个任务
  }
}

/**
 * 处理超时任务：当预设的延迟时间到达时，检查并处理定时器队列中的任务，
 * 决定下一步是执行主任务队列还是重新设置延迟等待。
 * 
 * @param {number} currentTime - 当前调度器的时间戳（通常由 getCurrentTime() 生成）
 */
function handleTimeout(currentTime) {
  // 1. 重置超时调度标志 (表示当前超时回调已触发, 允许设置新的超时回调)
  isHostTimeoutScheduled = false;
  // 2. 推进定时器: 将定时器队列中所有已到期的任务转移到主任务队列
  advanceTimers(currentTime);

  // 3. 检查是否已有主任务回调在调度中
  if (!isHostCallbackScheduled) {
    if (peek(taskQueue) !== null) {
      isHostCallbackScheduled = true; // 设置主任务调度标志
      requestHostCallback(flushWork);
    } else {
      // 获取定时器队列中最早的任务
      const firstTimer = peek(timerQueue);
      // 设置新的超时回调 (递归等待)
      if (firstTimer !== null) { 
        // // 计算需要等待的时间 = 最早任务开始时间 - 当前时间
        requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
      }
    }
  }
}

/**
 * 调度器执行任务的主入口
 * 它会调用 `workLoop` 循环处理任务队列中的任务, 并在执行前后处理一些状态和性能分析相关的逻辑
 * @param {*} hasTimeRemaining 
 * @param {*} initialTime 
 * @returns 
 */
function flushWork(hasTimeRemaining, initialTime) {
  // 1. 性能分析: 标记调度器开始工作 (非挂起状态)
  if (enableProfiling) {
    markSchedulerUnsuspended(initialTime);
  }

  // We'll need a host callback the next time work is scheduled.
  // 2. 重置调度状态: 取消不必要的超时回调
  isHostCallbackScheduled = false;
  if (isHostTimeoutScheduled) {
    // We scheduled a timeout but it's no longer needed. Cancel it.
    isHostTimeoutScheduled = false;
    cancelHostTimeout();
  }

  // 3. 设置工作状态和保存当前优先级
  isPerformingWork = true;
  const previousPriorityLevel = currentPriorityLevel;
  try {
    if (enableProfiling) {
      try {
        return workLoop(hasTimeRemaining, initialTime);
      } catch (error) {
        if (currentTask !== null) {
          const currentTime = getCurrentTime();
          markTaskErrored(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        throw error;
      }
    } else {
      // No catch in prod code path.
      return workLoop(hasTimeRemaining, initialTime);
    }
  } finally {
    currentTask = null;
    currentPriorityLevel = previousPriorityLevel;
    isPerformingWork = false;
    if (enableProfiling) {
      const currentTime = getCurrentTime();
      markSchedulerSuspended(currentTime);
    }
  }
}

/**
 * 
 * @param {*} hasTimeRemaining 
 * @param {*} initialTime 
 * @returns 
 */
function workLoop(hasTimeRemaining, initialTime) {
  let currentTime = initialTime;
  advanceTimers(currentTime);
  currentTask = peek(taskQueue);
  while (
    currentTask !== null &&
    !(enableSchedulerDebugging && isSchedulerPaused)
  ) {
    if (
      currentTask.expirationTime > currentTime &&
      (!hasTimeRemaining || shouldYieldToHost())
    ) {
      // This currentTask hasn't expired, and we've reached the deadline.
      break;
    }
    const callback = currentTask.callback;
    if (typeof callback === 'function') {
      currentTask.callback = null;
      currentPriorityLevel = currentTask.priorityLevel;
      const didUserCallbackTimeout = currentTask.expirationTime <= currentTime;
      if (enableProfiling) {
        markTaskRun(currentTask, currentTime);
      }
      const continuationCallback = callback(didUserCallbackTimeout);
      currentTime = getCurrentTime();
      if (typeof continuationCallback === 'function') {
        currentTask.callback = continuationCallback;
        if (enableProfiling) {
          markTaskYield(currentTask, currentTime);
        }
      } else {
        if (enableProfiling) {
          markTaskCompleted(currentTask, currentTime);
          currentTask.isQueued = false;
        }
        if (currentTask === peek(taskQueue)) {
          pop(taskQueue);
        }
      }
      advanceTimers(currentTime);
    } else {
      pop(taskQueue);
    }
    currentTask = peek(taskQueue);
  }
  // Return whether there's additional work
  if (currentTask !== null) {
    return true;
  } else {
    const firstTimer = peek(timerQueue);
    if (firstTimer !== null) {
      requestHostTimeout(handleTimeout, firstTimer.startTime - currentTime);
    }
    return false;
  }
}

/**
 * 在指定的调度优先级上下文中执行回调函数, 并自动恢复之前的优先级设置
 * 
 * @param {number} priorityLevel - 要设置的调度优先级，必须是以下值之一：
 *   - ImmediatePriority (必须立即执行, 最高优先级)
 *   - UserBlockingPriority (用户交互相关, 高优先级)
 *   - NormalPriority (默认优先级)
 *   - LowPriority (可延迟任务, 低优先级)
 *   - IdlePriority (空闲时执行, 最低优先级)
 * @param {function} eventHandler - 需要在该优先级下执行的函数
 * @returns {*} - 返回 eventHandler 函数的执行结果
 * 
 * @example
 * // 以用户阻塞优先级执行状态更新
 * unstable_runWithPriority(UserBlockingPriority, () => {
 *   setState({ clicked: true });
 * });
 * 
 * @note 这是React调度系统的底层API，通常通过Scheduler包暴露的稳定API间接使用
 * @see Scheduler.js 中的runWithPriority
 */
function unstable_runWithPriority(priorityLevel, eventHandler) {
  // 1. 校验优先级级别, 无效时降级为 NormalPriority
  switch (priorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
    case LowPriority:
    case IdlePriority:
      break;
    default:
      priorityLevel = NormalPriority;
  }

  // 2. 保存当前优先级, 并覆盖为新优先级
  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  // 3. 在指定优先级上下文中执行回调
  try {
    return eventHandler(); // 执行实际任务 (如渲染、副作用)
  } finally {
    // 4. 无论成功或失败, 恢复之前的优先级
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_next(eventHandler) {
  var priorityLevel;
  switch (currentPriorityLevel) {
    case ImmediatePriority:
    case UserBlockingPriority:
    case NormalPriority:
      // Shift down to normal priority
      priorityLevel = NormalPriority;
      break;
    default:
      // Anything lower than normal priority should remain at the current level.
      priorityLevel = currentPriorityLevel;
      break;
  }

  var previousPriorityLevel = currentPriorityLevel;
  currentPriorityLevel = priorityLevel;

  try {
    return eventHandler();
  } finally {
    currentPriorityLevel = previousPriorityLevel;
  }
}

function unstable_wrapCallback(callback) {
  var parentPriorityLevel = currentPriorityLevel;
  return function() {
    // This is a fork of runWithPriority, inlined for performance.
    var previousPriorityLevel = currentPriorityLevel;
    currentPriorityLevel = parentPriorityLevel;

    try {
      return callback.apply(this, arguments);
    } finally {
      currentPriorityLevel = previousPriorityLevel;
    }
  };
}

function unstable_scheduleCallback(priorityLevel, callback, options) {
  var currentTime = getCurrentTime();

  var startTime;
  if (typeof options === 'object' && options !== null) {
    var delay = options.delay;
    if (typeof delay === 'number' && delay > 0) {
      startTime = currentTime + delay;
    } else {
      startTime = currentTime;
    }
  } else {
    startTime = currentTime;
  }

  var timeout;
  switch (priorityLevel) {
    case ImmediatePriority:
      timeout = IMMEDIATE_PRIORITY_TIMEOUT;
      break;
    case UserBlockingPriority:
      timeout = USER_BLOCKING_PRIORITY_TIMEOUT;
      break;
    case IdlePriority:
      timeout = IDLE_PRIORITY_TIMEOUT;
      break;
    case LowPriority:
      timeout = LOW_PRIORITY_TIMEOUT;
      break;
    case NormalPriority:
    default:
      timeout = NORMAL_PRIORITY_TIMEOUT;
      break;
  }

  var expirationTime = startTime + timeout;

  var newTask = {
    id: taskIdCounter++,
    callback,
    priorityLevel,
    startTime,
    expirationTime,
    sortIndex: -1,
  };
  if (enableProfiling) {
    newTask.isQueued = false;
  }

  // .1 延时任务, 延时执行
  if (startTime > currentTime) {
    // This is a delayed task.
    newTask.sortIndex = startTime;
    push(timerQueue, newTask);
    // 如果当前没有超时任务, 则设置一个超时任务
    if (peek(taskQueue) === null && newTask === peek(timerQueue)) {
      // All tasks are delayed, and this is the task with the earliest delay.
      if (isHostTimeoutScheduled) {
        // Cancel an existing timeout.
        cancelHostTimeout();
      } else {
        isHostTimeoutScheduled = true;
      }
      // Schedule a timeout.
      requestHostTimeout(handleTimeout, startTime - currentTime);
    }
  // .2 超时任务, 立即执行任务
  } else {
    newTask.sortIndex = expirationTime;
    push(taskQueue, newTask);
    if (enableProfiling) {
      markTaskStart(newTask, currentTime);
      newTask.isQueued = true;
    }
    // Schedule a host callback, if needed. If we're already performing work,
    // wait until the next time we yield.
    if (!isHostCallbackScheduled && !isPerformingWork) {
      isHostCallbackScheduled = true;
      requestHostCallback(flushWork);
    }
  }

  return newTask;
}

function unstable_pauseExecution() {
  isSchedulerPaused = true;
}

function unstable_continueExecution() {
  isSchedulerPaused = false;
  if (!isHostCallbackScheduled && !isPerformingWork) {
    isHostCallbackScheduled = true;
    requestHostCallback(flushWork);
  }
}

function unstable_getFirstCallbackNode() {
  return peek(taskQueue);
}

function unstable_cancelCallback(task) {
  if (enableProfiling) {
    if (task.isQueued) {
      const currentTime = getCurrentTime();
      markTaskCanceled(task, currentTime);
      task.isQueued = false;
    }
  }

  // Null out the callback to indicate the task has been canceled. (Can't
  // remove from the queue because you can't remove arbitrary nodes from an
  // array based heap, only the first one.)
  task.callback = null;
}

function unstable_getCurrentPriorityLevel() {
  return currentPriorityLevel;
}

let isMessageLoopRunning = false;
let scheduledHostCallback = null;
let taskTimeoutID = -1;

// Scheduler periodically yields in case there is other work on the main
// thread, like user events. By default, it yields multiple times per frame.
// It does not attempt to align with frame boundaries, since most tasks don't
// need to be frame aligned; for those that do, use requestAnimationFrame.
let frameInterval = frameYieldMs;
const continuousInputInterval = continuousYieldMs;
const maxInterval = maxYieldMs;
let startTime = -1;

let needsPaint = false;

function shouldYieldToHost() {
  const timeElapsed = getCurrentTime() - startTime;
  if (timeElapsed < frameInterval) {
    // The main thread has only been blocked for a really short amount of time;
    // smaller than a single frame. Don't yield yet.
    return false;
  }

  // The main thread has been blocked for a non-negligible amount of time. We
  // may want to yield control of the main thread, so the browser can perform
  // high priority tasks. The main ones are painting and user input. If there's
  // a pending paint or a pending input, then we should yield. But if there's
  // neither, then we can yield less often while remaining responsive. We'll
  // eventually yield regardless, since there could be a pending paint that
  // wasn't accompanied by a call to `requestPaint`, or other main thread tasks
  // like network events.
  if (enableIsInputPending) {
    if (needsPaint) {
      // There's a pending paint (signaled by `requestPaint`). Yield now.
      return true;
    }
    if (timeElapsed < continuousInputInterval) {
      // We haven't blocked the thread for that long. Only yield if there's a
      // pending discrete input (e.g. click). It's OK if there's pending
      // continuous input (e.g. mouseover).
      if (isInputPending !== null) {
        return isInputPending();
      }
    } else if (timeElapsed < maxInterval) {
      // Yield if there's either a pending discrete or continuous input.
      if (isInputPending !== null) {
        return isInputPending(continuousOptions);
      }
    } else {
      // We've blocked the thread for a long time. Even if there's no pending
      // input, there may be some other scheduled work that we don't know about,
      // like a network event. Yield now.
      return true;
    }
  }

  // `isInputPending` isn't available. Yield now.
  return true;
}

function requestPaint() {
  if (
    enableIsInputPending &&
    navigator !== undefined &&
    navigator.scheduling !== undefined &&
    navigator.scheduling.isInputPending !== undefined
  ) {
    needsPaint = true;
  }

  // Since we yield every frame regardless, `requestPaint` has no effect.
}

function forceFrameRate(fps) {
  if (fps < 0 || fps > 125) {
    // Using console['error'] to evade Babel and ESLint
    console['error'](
      'forceFrameRate takes a positive int between 0 and 125, ' +
        'forcing frame rates higher than 125 fps is not supported',
    );
    return;
  }
  if (fps > 0) {
    frameInterval = Math.floor(1000 / fps);
  } else {
    // reset the framerate
    frameInterval = frameYieldMs;
  }
}

/**
 * 帧结束前执行任务
 * React 调度器（Scheduler）模块 的核心逻辑之一，用于在浏览器环境中 分块执行任务 并确保主线程不被长时间阻塞（即实现时间切片 Time Slicing）
 */
const performWorkUntilDeadline = () => {
  if (scheduledHostCallback !== null) {
    const currentTime = getCurrentTime(); // 获取当前时间
    // Keep track of the start time so we can measure how long the main thread
    // has been blocked.
    startTime = currentTime;
    const hasTimeRemaining = true;

    // If a scheduler task throws, exit the current browser task so the
    // error can be observed.
    //
    // Intentionally not using a try-catch, since that makes some debugging
    // techniques harder. Instead, if `scheduledHostCallback` errors, then
    // `hasMoreWork` will remain true, and we'll continue the work loop.
    let hasMoreWork = true;
    try {
      // flushWork 执行任务
      hasMoreWork = scheduledHostCallback(hasTimeRemaining, currentTime);
    } finally {
      if (hasMoreWork) { // 判断是否还有剩余任务, 决定是否继续调度下一轮执行
        // 如果还有工作，安排下一个宏任务 (如 MessageChannel、setTimeout)
        schedulePerformWorkUntilDeadline();
      } else { // 无剩余工作, 重置调度状态
        isMessageLoopRunning = false;
        scheduledHostCallback = null;
      }
    }
  } else {
    isMessageLoopRunning = false;
  }
  // Yielding to the browser will give it a chance to paint, so we can
  // reset this.
  needsPaint = false; // 重置绘制标志, 允许浏览器渲染
};

let schedulePerformWorkUntilDeadline;
/**
 * 适用环境: Node.js 和 老版本IE
 * 
 * https://github.com/facebook/react/issues/20756
 */
if (typeof localSetImmediate === 'function') {
  schedulePerformWorkUntilDeadline = () => {
    localSetImmediate(performWorkUntilDeadline);
  };
// 适用环境: 支持 MessageChannel 的浏览器和 Web Worker
} else if (typeof MessageChannel !== 'undefined') {
  // DOM and Worker environments.
  // We prefer MessageChannel because of the 4ms setTimeout clamping.
  const channel = new MessageChannel();
  const port = channel.port2;
  channel.port1.onmessage = performWorkUntilDeadline;
  schedulePerformWorkUntilDeadline = () => {
    port.postMessage(null);
  };
// 不支持上述 API 的特殊环境 (如某些 Service Worker)
} else {
  // We should only fallback here in non-browser environments.
  schedulePerformWorkUntilDeadline = () => {
    localSetTimeout(performWorkUntilDeadline, 0);
  };
}

/**
 * 用于请求浏览器宿主环境执行一个异步任务回调
 * 
 * @param {*} callback 
 */
function requestHostCallback(callback) {
  scheduledHostCallback = callback;
  if (!isMessageLoopRunning) { // 检查是否已有调度循环在进行
    isMessageLoopRunning = true; // 标记循环为运行状态
    schedulePerformWorkUntilDeadline(); // 安排宏任务执行
  }
}

function requestHostTimeout(callback, ms) {
  taskTimeoutID = localSetTimeout(() => {
    callback(getCurrentTime());
  }, ms);
}

function cancelHostTimeout() {
  localClearTimeout(taskTimeoutID);
  taskTimeoutID = -1;
}

const unstable_requestPaint = requestPaint;

export {
  ImmediatePriority as unstable_ImmediatePriority,
  UserBlockingPriority as unstable_UserBlockingPriority,
  NormalPriority as unstable_NormalPriority,
  IdlePriority as unstable_IdlePriority,
  LowPriority as unstable_LowPriority,
  unstable_runWithPriority,
  unstable_next,
  unstable_scheduleCallback,
  unstable_cancelCallback,
  unstable_wrapCallback,
  unstable_getCurrentPriorityLevel,
  shouldYieldToHost as unstable_shouldYield,
  unstable_requestPaint,
  unstable_continueExecution,
  unstable_pauseExecution,
  unstable_getFirstCallbackNode,
  getCurrentTime as unstable_now,
  forceFrameRate as unstable_forceFrameRate,
};

export const unstable_Profiling = enableProfiling
  ? {
      startLoggingProfilingEvents,
      stopLoggingProfilingEvents,
    }
  : null;
