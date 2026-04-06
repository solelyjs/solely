import { BaseElement, CustomElement } from '../../src/index.ts';
import template from './index.html?raw';
import styles from './index.css?raw';

interface RefExampleData {
    username: string;
    password: string;
    submitted: boolean;
}

@CustomElement({
    tagName: 'ref-example',
    template: template,
    styles: styles,
})
export class RefExample extends BaseElement<
    RefExampleData,
    {
        usernameInput: HTMLInputElement;
        passwordInput: HTMLInputElement;
        loginButton: HTMLButtonElement;
        resultDiv: HTMLDivElement;
    }
> {
    constructor() {
        super({
            username: '',
            password: '',
            submitted: false,
        });
    }

    /**
     * 处理登录
     */
    handleLogin() {
        // 通过 $refs 访问元素
        const username = this.$refs.usernameInput.value;
        const password = this.$refs.passwordInput.value;

        if (username && password) {
            // 更新数据
            this.$data.username = username;
            this.$data.submitted = true;

            // 操作 DOM 元素
            this.$refs.loginButton.disabled = true;
            this.$refs.resultDiv.style.backgroundColor = '#d4edda';
            this.$refs.resultDiv.style.borderColor = '#c3e6cb';

            console.log('登录成功:', username);
        } else {
            // 提示用户
            this.$refs.resultDiv.style.backgroundColor = '#f8d7da';
            this.$refs.resultDiv.style.borderColor = '#f5c6cb';
            console.log('请输入用户名和密码');
        }
    }

    /**
     * 处理重置
     */
    handleReset() {
        // 重置表单
        this.$refs.usernameInput.value = '';
        this.$refs.passwordInput.value = '';
        this.$refs.loginButton.disabled = false;

        // 重置数据
        this.$data.username = '';
        this.$data.password = '';
        this.$data.submitted = false;

        // 重置结果区域
        this.$refs.resultDiv.style.backgroundColor = '#f0f0f0';
        this.$refs.resultDiv.style.borderColor = 'transparent';

        console.log('表单已重置');
    }
}
