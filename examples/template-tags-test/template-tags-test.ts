import { BaseElement, CustomElement } from '../../src/base';
import template from './template-tags-test.html?raw';
import styles from './template-tags-test.css?raw';

interface TemplateTagsData {
  items: { id: number; name: string; completed: boolean }[];
  condition: 'A' | 'B' | 'C' | 'D';
  counter: number;
  showList: boolean;
}

@CustomElement({
  tagName: 'template-tags-test',
  template,
  styles,
  className: 'template-tags-test',
  shadowDOM: { use: true, mode: 'open' }
})
export default class TemplateTagsTestElement extends BaseElement<TemplateTagsData> {
  constructor() {
    super({
      items: [
        { id: 1, name: '学习Web Components', completed: true },
        { id: 2, name: '测试条件标签', completed: false },
        { id: 3, name: '测试循环标签', completed: false },
        { id: 4, name: '构建示例组件', completed: true }
      ],
      condition: 'A',
      counter: 0,
      showList: true
    });
  }

  created() {
    console.log('Template Tags Test component created');
  }

  mounted() {
    console.log('Template Tags Test component mounted');
  }

  toggleItemStatus(id: number) {
    const item = this.$data.items.find(item => item.id === id);
    if (item) {
      item.completed = !item.completed;
    }
  }

  addItem() {
    const newId = Math.max(...this.$data.items.map(item => item.id)) + 1;
    this.$data.items.push({
      id: newId,
      name: `新项目 ${newId}`,
      completed: false
    });
  }

  removeItem(id: number) {
    this.$data.items = this.$data.items.filter(item => item.id !== id);
  }

  changeCondition() {
    const conditions: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];
    const currentIndex = conditions.indexOf(this.$data.condition);
    this.$data.condition = conditions[(currentIndex + 1) % conditions.length];
  }

  incrementCounter() {
    this.$data.counter++;
  }

  toggleList() {
    this.$data.showList = !this.$data.showList;
  }
}