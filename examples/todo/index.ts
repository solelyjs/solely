import { BaseElement, CustomElement } from '../../src/index.ts';
import template from './index.html?raw';
import styles from './index.css?raw';

interface TodoItem {
    id: number;
    text: string;
    completed: boolean;
}

@CustomElement({
    tagName: 'todo-list',
    template,
    styles,
    shadowDOM: { use: true },
})
// @ts-expect-error: 类通过装饰器注册为自定义元素
class TodoList extends BaseElement<{
    todos: TodoItem[];
    newTodoText: string;
    filter: 'all' | 'active' | 'completed';
    testData: {
        count: number;
        step: number;
        history: any[];
    };
}> {
    constructor() {
        super({
            todos: [
                { id: 1, text: '学习 Solely 框架', completed: true },
                { id: 2, text: '创建示例项目', completed: false },
                { id: 3, text: '完善文档', completed: false },
            ],
            newTodoText: '',
            filter: 'all',
            testData: {
                count: 22,
                step: 5,
                history: [],
            },
        });
    }

    get filteredTodos() {
        switch (this.$data.filter) {
            case 'active':
                return this.$data.todos.filter(t => !t.completed);
            case 'completed':
                return this.$data.todos.filter(t => t.completed);
            default:
                return this.$data.todos;
        }
    }

    get remainingCount() {
        return this.$data.todos.filter(t => !t.completed).length;
    }

    addTodo() {
        if (this.$data.newTodoText.trim()) {
            this.$data.todos.push({
                id: Date.now(),
                text: this.$data.newTodoText.trim(),
                completed: false,
            });
            this.$data.newTodoText = '';
            this.saveTodos();
        }
    }

    toggleTodo(id: number) {
        this.$data.todos = this.$data.todos.map(todo =>
            todo.id === id ? { ...todo, completed: !todo.completed } : todo,
        );
        this.saveTodos();
    }

    deleteTodo(id: number) {
        this.$data.todos = this.$data.todos.filter(todo => todo.id !== id);
        this.saveTodos();
    }

    setFilter(filter: 'all' | 'active' | 'completed') {
        this.$data.filter = filter;
    }

    clearCompleted() {
        this.$data.todos = this.$data.todos.filter(t => !t.completed);
        this.saveTodos();
    }

    private saveTodos() {
        localStorage.setItem('solely-todo-todos', JSON.stringify(this.$data.todos));
    }
}

console.log('Todo List component registered successfully!');
