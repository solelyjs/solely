import { BaseElement, CustomElement } from '../../../src/base';
import template from './user-card.html?raw';
import styles from './user-card.css?raw';

interface User {
  id: number;
  name: string;
  email: string;
  avatar: string;
  role: string;
  department: string;
  isActive: boolean;
}

interface UserCardData {
  user: User;
  showDetails: boolean;
}

@CustomElement({
  tagName: 'solely-user-card',
  template,
  styles,
  props: ['user-id'],
  className: 'solely-user-card',
  shadowDOM: { use: true, mode: 'open' }
})
export default class UserCardElement extends BaseElement<UserCardData> {
  constructor() {
    super({
      user: {
        id: 1,
        name: 'John Doe',
        email: 'john.doe@example.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JohnDoe',
        role: 'Frontend Developer',
        department: 'Engineering',
        isActive: true
      },
      showDetails: false
    });
  }

  created() {
    console.log('UserCard component created');
    // 可以在这里添加数据加载逻辑
  }

  mounted() {
    console.log('UserCard component mounted');
    // 检查是否有userId属性并加载对应用户数据
    const userId = this.getAttribute('user-id');
    if (userId) {
      this.loadUserData(parseInt(userId));
    }
  }

  toggleDetails() {
    this.$data.showDetails = !this.$data.showDetails;
  }

  async loadUserData(userId: number) {
    // 模拟API请求
    console.log(`Loading user data for ID: ${userId}`);

    // 这里可以替换为实际的API调用
    // 模拟延迟
    await new Promise(resolve => setTimeout(resolve, 300));

    // 模拟不同ID返回不同用户数据
    const mockUsers: Record<number, User> = {
      1: {
        id: 1,
        name: 'John Doe',
        email: 'john.doe@example.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JohnDoe',
        role: 'Frontend Developer',
        department: 'Engineering',
        isActive: true
      },
      2: {
        id: 2,
        name: 'Jane Smith',
        email: 'jane.smith@example.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=JaneSmith',
        role: 'Product Manager',
        department: 'Product',
        isActive: true
      },
      3: {
        id: 3,
        name: 'Mike Johnson',
        email: 'mike.j@example.com',
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=MikeJohnson',
        role: 'Backend Developer',
        department: 'Engineering',
        isActive: false
      }
    };

    if (mockUsers[userId]) {
      this.$data.user = { ...mockUsers[userId] };
    }
  }

  attributeChangedCallback(name: string, oldValue: string | null, newValue: string | null) {
    super.attributeChangedCallback(name, oldValue, newValue);

    if (name === 'user-id' && oldValue !== newValue && newValue) {
      this.loadUserData(parseInt(newValue));
    }
  }
}