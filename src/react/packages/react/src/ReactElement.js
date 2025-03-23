/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import getComponentNameFromType from 'shared/getComponentNameFromType';
import {REACT_ELEMENT_TYPE} from 'shared/ReactSymbols';
import assign from 'shared/assign';
import hasOwnProperty from 'shared/hasOwnProperty';
import {checkKeyStringCoercion} from 'shared/CheckStringCoercion';

import ReactCurrentOwner from './ReactCurrentOwner';

const RESERVED_PROPS = {
  key: true,
  ref: true,
  __self: true,
  __source: true,
};

let specialPropKeyWarningShown,
  specialPropRefWarningShown,
  didWarnAboutStringRefs;

if (__DEV__) {
  didWarnAboutStringRefs = {};
}

function hasValidRef(config) {
  if (__DEV__) {
    if (hasOwnProperty.call(config, 'ref')) {
      const getter = Object.getOwnPropertyDescriptor(config, 'ref').get;
      if (getter && getter.isReactWarning) {
        return false;
      }
    }
  }
  return config.ref !== undefined;
}

function hasValidKey(config) {
  if (__DEV__) {
    if (hasOwnProperty.call(config, 'key')) {
      const getter = Object.getOwnPropertyDescriptor(config, 'key').get;
      if (getter && getter.isReactWarning) {
        return false;
      }
    }
  }
  return config.key !== undefined;
}

function defineKeyPropWarningGetter(props, displayName) {
  const warnAboutAccessingKey = function() {
    if (__DEV__) {
      if (!specialPropKeyWarningShown) {
        specialPropKeyWarningShown = true;
        console.error(
          '%s: `key` is not a prop. Trying to access it will result ' +
            'in `undefined` being returned. If you need to access the same ' +
            'value within the child component, you should pass it as a different ' +
            'prop. (https://reactjs.org/link/special-props)',
          displayName,
        );
      }
    }
  };
  warnAboutAccessingKey.isReactWarning = true;
  Object.defineProperty(props, 'key', {
    get: warnAboutAccessingKey,
    configurable: true,
  });
}

function defineRefPropWarningGetter(props, displayName) {
  const warnAboutAccessingRef = function() {
    if (__DEV__) {
      if (!specialPropRefWarningShown) {
        specialPropRefWarningShown = true;
        console.error(
          '%s: `ref` is not a prop. Trying to access it will result ' +
            'in `undefined` being returned. If you need to access the same ' +
            'value within the child component, you should pass it as a different ' +
            'prop. (https://reactjs.org/link/special-props)',
          displayName,
        );
      }
    }
  };
  warnAboutAccessingRef.isReactWarning = true;
  Object.defineProperty(props, 'ref', {
    get: warnAboutAccessingRef,
    configurable: true,
  });
}

function warnIfStringRefCannotBeAutoConverted(config) {
  if (__DEV__) {
    if (
      typeof config.ref === 'string' &&
      ReactCurrentOwner.current &&
      config.__self &&
      ReactCurrentOwner.current.stateNode !== config.__self
    ) {
      const componentName = getComponentNameFromType(
        ReactCurrentOwner.current.type,
      );

      if (!didWarnAboutStringRefs[componentName]) {
        console.error(
          'Component "%s" contains the string ref "%s". ' +
            'Support for string refs will be removed in a future major release. ' +
            'This case cannot be automatically converted to an arrow function. ' +
            'We ask you to manually fix this case by using useRef() or createRef() instead. ' +
            'Learn more about using refs safely here: ' +
            'https://reactjs.org/link/strict-mode-string-ref',
          componentName,
          config.ref,
        );
        didWarnAboutStringRefs[componentName] = true;
      }
    }
  }
}

/**
 * Factory method to create a new React element. This no longer adheres to
 * the class pattern, so do not use new to call it. Also, instanceof check
 * will not work. Instead test $$typeof field against Symbol.for('react.element') to check
 * if something is a React Element.
 *
 * @param {*} type
 * @param {*} props
 * @param {*} key
 * @param {string|object} ref
 * @param {*} owner
 * @param {*} self A *temporary* helper to detect places where `this` is
 * different from the `owner` when React.createElement is called, so that we
 * can warn. We want to get rid of owner and replace string `ref`s with arrow
 * functions, and as long as `this` and owner are the same, there will be no
 * change in behavior.
 * @param {*} source An annotation object (added by a transpiler or otherwise)
 * indicating filename, line number, and/or other information.
 * @internal
 */
const ReactElement = function(type, key, ref, self, source, owner, props) {
  const element = {
    // This tag allows us to uniquely identify this as a React Element
    $$typeof: REACT_ELEMENT_TYPE,

    // Built-in properties that belong on the element
    type: type,
    key: key,
    ref: ref,
    props: props,

    // Record the component responsible for creating this element.
    _owner: owner,
  };

  if (__DEV__) {
    // The validation flag is currently mutative. We put it on
    // an external backing store so that we can freeze the whole object.
    // This can be replaced with a WeakMap once they are implemented in
    // commonly used development environments.
    element._store = {};

    // To make comparing ReactElements easier for testing purposes, we make
    // the validation flag non-enumerable (where possible, which should
    // include every environment we run tests in), so the test framework
    // ignores it.
    Object.defineProperty(element._store, 'validated', {
      configurable: false,
      enumerable: false,
      writable: true,
      value: false,
    });
    // self and source are DEV only properties.
    Object.defineProperty(element, '_self', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: self,
    });
    // Two elements created in two different places should be considered
    // equal for testing purposes and therefore we hide it from enumeration.
    Object.defineProperty(element, '_source', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: source,
    });
    if (Object.freeze) {
      Object.freeze(element.props);
      Object.freeze(element);
    }
  }

  return element;
};

/**
 * https://github.com/reactjs/rfcs/pull/107
 * @param {*} type
 * @param {object} props
 * @param {string} key
 */
export function jsx(type, config, maybeKey) {
  let propName;

  // Reserved names are extracted
  const props = {};

  let key = null;
  let ref = null;

  // Currently, key can be spread in as a prop. This causes a potential
  // issue if key is also explicitly declared (ie. <div {...props} key="Hi" />
  // or <div key="Hi" {...props} /> ). We want to deprecate key spread,
  // but as an intermediary step, we will use jsxDEV for everything except
  // <div {...props} key="Hi" />, because we aren't currently able to tell if
  // key is explicitly declared to be undefined or not.
  if (maybeKey !== undefined) {
    if (__DEV__) {
      checkKeyStringCoercion(maybeKey);
    }
    key = '' + maybeKey;
  }

  if (hasValidKey(config)) {
    if (__DEV__) {
      checkKeyStringCoercion(config.key);
    }
    key = '' + config.key;
  }

  if (hasValidRef(config)) {
    ref = config.ref;
  }

  // Remaining properties are added to a new props object
  for (propName in config) {
    if (
      hasOwnProperty.call(config, propName) &&
      !RESERVED_PROPS.hasOwnProperty(propName)
    ) {
      props[propName] = config[propName];
    }
  }

  // Resolve default props
  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }

  return ReactElement(
    type,
    key,
    ref,
    undefined,
    undefined,
    ReactCurrentOwner.current,
    props,
  );
}

/**
 * https://github.com/reactjs/rfcs/pull/107
 * @param {*} type
 * @param {object} props
 * @param {string} key
 */
export function jsxDEV(type, config, maybeKey, source, self) {
  let propName;

  // Reserved names are extracted
  const props = {};

  let key = null;
  let ref = null;

  // Currently, key can be spread in as a prop. This causes a potential
  // issue if key is also explicitly declared (ie. <div {...props} key="Hi" />
  // or <div key="Hi" {...props} /> ). We want to deprecate key spread,
  // but as an intermediary step, we will use jsxDEV for everything except
  // <div {...props} key="Hi" />, because we aren't currently able to tell if
  // key is explicitly declared to be undefined or not.
  if (maybeKey !== undefined) {
    if (__DEV__) {
      checkKeyStringCoercion(maybeKey);
    }
    key = '' + maybeKey;
  }

  if (hasValidKey(config)) {
    if (__DEV__) {
      checkKeyStringCoercion(config.key);
    }
    key = '' + config.key;
  }

  if (hasValidRef(config)) {
    ref = config.ref;
    warnIfStringRefCannotBeAutoConverted(config);
  }

  // Remaining properties are added to a new props object
  for (propName in config) {
    if (
      hasOwnProperty.call(config, propName) &&
      !RESERVED_PROPS.hasOwnProperty(propName)
    ) {
      props[propName] = config[propName];
    }
  }

  // Resolve default props
  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }

  if (key || ref) {
    const displayName =
      typeof type === 'function'
        ? type.displayName || type.name || 'Unknown'
        : type;
    if (key) {
      defineKeyPropWarningGetter(props, displayName);
    }
    if (ref) {
      defineRefPropWarningGetter(props, displayName);
    }
  }

  return ReactElement(
    type,
    key,
    ref,
    self,
    source,
    ReactCurrentOwner.current,
    props,
  );
}

/**
 * 创建并返回一个新的 React 元素
 * 文档 https://zh-hans.react.dev/reference/react/createElement
 * @param {*} type - 元素的类型 (HTML 标签 / 组件函数 / 类)
 * @param {object|null} config - 
 * @param {...*} children - 子元素
 * @returns {ReactElement}
 */
export function createElement(type, config, children) {
  let propName;

  const props = {}; // 空对象 (用于存储属性)

  // 初始化 key、ref、self、source 属性
  let key = null;
  let ref = null;
  let self = null;
  let source = null;

  if (config != null) { // 如果 config 不为空
    if (hasValidRef(config)) { // 如果 config 包含有效的 ref 属性
      ref = config.ref;

      if (__DEV__) { // 开发环境警告: 检查 ref 属性的合法性
        warnIfStringRefCannotBeAutoConverted(config);
      }
    }
    if (hasValidKey(config)) { // 如果 config 包含有效的 key 属性
      if (__DEV__) { // 开发环境警告: 检查 key 的类型
        checkKeyStringCoercion(config.key);
      }
      key = '' + config.key; // 将 key 转换为字符串
    }

    // 提取 self 和 source 属性 (babel 插件: babel-preset-react 注入的调试信息)
    self = config.__self === undefined ? null : config.__self;
    source = config.__source === undefined ? null : config.__source;
    // 去除 key、ref、__self、__source 属性, 剩余的属性被添加到新的 props 对象中
    for (propName in config) {
      if (
        hasOwnProperty.call(config, propName) &&
        !RESERVED_PROPS.hasOwnProperty(propName)
      ) {
        props[propName] = config[propName];
      }
    }
  }

  // 处理子元素
  const childrenLength = arguments.length - 2;
  // 1. 只有一个子元素, 直接赋值给 props.children
  if (childrenLength === 1) {
    props.children = children;
  // 2. 有多个子元素, 将它们放到一个数组中赋值给 props.children
  } else if (childrenLength > 1) {
    const childArray = Array(childrenLength);
    for (let i = 0; i < childrenLength; i++) {
      childArray[i] = arguments[i + 2];
    }
    if (__DEV__) { // 在开发环境中冻结子元素数组 (用于检测意外修改)
      if (Object.freeze) {
        Object.freeze(childArray);
      }
    }
    props.children = childArray;
  }

  // 处理默认属性
  if (type && type.defaultProps) {
    const defaultProps = type.defaultProps;
    for (propName in defaultProps) {
      if (props[propName] === undefined) {
        props[propName] = defaultProps[propName];
      }
    }
  }
  if (__DEV__) { // 开发环境警告: 检查 key 和 ref 属性
    if (key || ref) {
      const displayName =
        typeof type === 'function'
          ? type.displayName || type.name || 'Unknown'
          : type;
      if (key) {
        defineKeyPropWarningGetter(props, displayName);
      }
      if (ref) {
        defineRefPropWarningGetter(props, displayName);
      }
    }
  }
  return ReactElement( // 返回一个新的 ReactElement 实例
    type,                      // 元素的类型
    key,                       // 元素的 key 属性
    ref,                       // 元素的 ref 属性
    self,                      // 元素的 __self 属性
    source,                    // 元素的 __source 属性
    ReactCurrentOwner.current, // 当前的 React 当前拥有者 (用于调试)
    props,                     // 元素的属性和子元素
  );
}

/**
 * Return a function that produces ReactElements of a given type.
 * See https://reactjs.org/docs/react-api.html#createfactory
 */
export function createFactory(type) {
  const factory = createElement.bind(null, type);
  // Expose the type on the factory and the prototype so that it can be
  // easily accessed on elements. E.g. `<Foo />.type === Foo`.
  // This should not be named `constructor` since this may not be the function
  // that created the element, and it may not even be a constructor.
  // Legacy hook: remove it
  factory.type = type;
  return factory;
}

export function cloneAndReplaceKey(oldElement, newKey) {
  const newElement = ReactElement(
    oldElement.type,
    newKey,
    oldElement.ref,
    oldElement._self,
    oldElement._source,
    oldElement._owner,
    oldElement.props,
  );

  return newElement;
}

/**
 * Clone and return a new ReactElement using element as the starting point.
 * See https://reactjs.org/docs/react-api.html#cloneelement
 */
/**
 * 克隆并返回一个新的 React 元素，以原始元素为起点。
 * 文档 https://reactjs.org/docs/react-api.html#cloneelement
 *
 * @param {ReactElement} element - 要克隆的 React 元素。必须是一个有效的 React 元素。
 * @param {object} [config] - 用于修改克隆元素的配置对象，包括 `key`、`ref` 以及其他属性。
 * @param {...*} [children] - 新的子元素，可以是一个或多个。
 * @return {ReactElement} 返回一个新的 React 元素，包含修改后的属性和子元素。
 *
 * @throws {Error} 如果传入的 `element` 不是一个有效的 React 元素，将抛出错误。
 */
export function cloneElement(element, config, children) {
  if (element === null || element === undefined) {
    throw new Error(
      `React.cloneElement(...): The argument must be a React element, but you passed ${element}.`,
    );
  }

  let propName;

  // Original props are copied
  const props = assign({}, element.props);

  // Reserved names are extracted
  let key = element.key;
  let ref = element.ref;
  // Self is preserved since the owner is preserved.
  const self = element._self;
  // Source is preserved since cloneElement is unlikely to be targeted by a
  // transpiler, and the original source is probably a better indicator of the
  // true owner.
  const source = element._source;

  // Owner will be preserved, unless ref is overridden
  let owner = element._owner;

  if (config != null) {
    if (hasValidRef(config)) {
      // Silently steal the ref from the parent.
      ref = config.ref;
      owner = ReactCurrentOwner.current;
    }
    if (hasValidKey(config)) {
      if (__DEV__) {
        checkKeyStringCoercion(config.key);
      }
      key = '' + config.key;
    }

    // Remaining properties override existing props
    let defaultProps;
    if (element.type && element.type.defaultProps) {
      defaultProps = element.type.defaultProps;
    }
    for (propName in config) {
      if (
        hasOwnProperty.call(config, propName) &&
        !RESERVED_PROPS.hasOwnProperty(propName)
      ) {
        if (config[propName] === undefined && defaultProps !== undefined) {
          // Resolve default props
          props[propName] = defaultProps[propName];
        } else {
          props[propName] = config[propName];
        }
      }
    }
  }

  // Children can be more than one argument, and those are transferred onto
  // the newly allocated props object.
  const childrenLength = arguments.length - 2;
  if (childrenLength === 1) {
    props.children = children;
  } else if (childrenLength > 1) {
    const childArray = Array(childrenLength);
    for (let i = 0; i < childrenLength; i++) {
      childArray[i] = arguments[i + 2];
    }
    props.children = childArray;
  }

  return ReactElement(element.type, key, ref, self, source, owner, props);
}

/**
 * 检查给定的对象是否是一个有效的 React 元素
 * @param {?object} object - 需要检查的对象
 * @return {boolean}
 */
export function isValidElement(object) {
  // React 元素具有一个特殊的内部属性 `$$typeof`, 用于区分它们与其他对象
  return (
    typeof object === 'object' &&
    object !== null &&
    object.$$typeof === REACT_ELEMENT_TYPE
  );
}
