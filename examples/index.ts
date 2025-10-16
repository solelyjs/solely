// 组件注册入口文件
// 导入所有组件，这样只需导入这个文件就能注册所有组件

export { default as CounterElement } from './counter/counter';
export { default as TodoListElement } from './todo-list/todo-list';
export { default as UserCardElement } from './user-card/user-card';

// 自动注册所有组件
import './counter/counter';
import './todo-list/todo-list';
import './user-card/user-card';
import './template-tags-test/template-tags-test';
import './router-test/router-test';