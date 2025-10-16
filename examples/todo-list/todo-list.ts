import { BaseElement, CustomElement } from '../../src/base';
import template from './todo-list.html?raw';
import styles from './todo-list.css?raw';

interface TodoItem {
  id: number;
  text: string;
  completed: boolean;
}

interface TodoListData {
  todos: TodoItem[];
  newTodoText: string;
  filter: 'all' | 'active' | 'completed';
  filteredTodos: TodoItem[];
}

@CustomElement({
  tagName: 'solely-todo-list',
  template,
  styles,
  className: 'solely-todo-list',
  shadowDOM: { use: true, mode: 'open' }
})
export default class TodoListElement extends BaseElement<TodoListData> {
  constructor() {
    super({
      todos: [
        { id: 1, text: 'Learn Web Components', completed: false },
        { id: 2, text: 'Build a Todo App', completed: true },
        { id: 3, text: 'Explore Solely Framework', completed: false }
      ],
      newTodoText: '',
      filter: 'all',
      filteredTodos: []
    });
  }

  created() {
    console.log('TodoList component created');
  }

  mounted() {
    console.log('TodoList component mounted');
    this.updateFilteredTodos();
  }

  updateFilteredTodos() {
    switch (this.$data.filter) {
      case 'active':
        this.$data.filteredTodos = this.$data.todos.filter(todo => !todo.completed);
        break;
      case 'completed':
        this.$data.filteredTodos = this.$data.todos.filter(todo => todo.completed);
        break;
      default:
        this.$data.filteredTodos = [...this.$data.todos];
        break;
    }
  }

  addTodo() {
    if (this.$data.newTodoText.trim()) {
      const newTodo: TodoItem = {
        id: Date.now(),
        text: this.$data.newTodoText.trim(),
        completed: false
      };
      this.$data.todos.push(newTodo);
      this.$data.newTodoText = '';
      this.updateFilteredTodos();
    }
  }

  toggleTodo(id: number) {
    const todo = this.$data.todos.find(item => item.id === id);
    if (todo) {
      todo.completed = !todo.completed;
      this.updateFilteredTodos();
    }
  }

  removeTodo(id: number) {
    const index = this.$data.todos.findIndex(item => item.id === id);
    if (index !== -1) {
      this.$data.todos.splice(index, 1);
      this.updateFilteredTodos();
    }
  }

  clearCompleted() {
    this.$data.todos = this.$data.todos.filter(todo => !todo.completed);
    this.updateFilteredTodos()
  }

  setFilter(filter: 'all' | 'active' | 'completed') {
    this.$data.filter = filter;
    this.updateFilteredTodos()
  }

  handleInputChange(event: Event) {
    const target = event.target as HTMLInputElement;
    this.$data.newTodoText = target.value
  }

  handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.addTodo();
    }
  }



  get activeCount() {
    return this.$data.todos.filter(todo => !todo.completed).length;
  }
}