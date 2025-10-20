// 组件注册入口文件
// 导入所有组件，这样只需导入这个文件就能注册所有组件

export { default as CounterElement } from './components/counter/counter';
export { default as TodoListElement } from './components/todo-list/todo-list';
export { default as UserCardElement } from './components/user-card/user-card';

// 自动注册所有组件
import './components/counter/counter';
import './components/todo-list/todo-list';
import './components/user-card/user-card';
import './framework-lab/framework-lab';
import './template-tags-test/template-tags-test';
import './router-test/router-test';