import { BaseElement, CustomElement } from '../../src/index.ts';
import template from './index.html?raw';
import styles from './index.css?raw';

/**
 * 注册表单数据接口
 */
interface RegistrationFormData {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    captcha: string;
    agreeTerms: boolean;
}

/**
 * 错误信息接口
 */
interface FormErrors {
    username: string;
    email: string;
    password: string;
    confirmPassword: string;
    captcha: string;
}

/**
 * 注册表单组件
 * 演示表单验证功能
 */
@CustomElement({
    tagName: 'registration-form',
    template,
    styles,
    shadowDOM: { use: true },
})
export class RegistrationForm extends BaseElement<{
    form: RegistrationFormData;
    errors: FormErrors;
    isSubmitting: boolean;
    isSuccess: boolean;
    captchaCountdown: number;
    passwordStrength: number;
}> {
    constructor() {
        super({
            form: {
                username: '',
                email: '',
                password: '',
                confirmPassword: '',
                captcha: '',
                agreeTerms: false,
            },
            errors: {
                username: '',
                email: '',
                password: '',
                confirmPassword: '',
                captcha: '',
            },
            isSubmitting: false,
            isSuccess: false,
            captchaCountdown: 0,
            passwordStrength: 0,
        });
    }

    /**
     * 计算密码强度
     */
    getPasswordStrength(): number {
        const password = this.$data.form.password;
        if (!password) return 0;

        let strength = 0;
        // 长度检查
        if (password.length >= 8) strength += 20;
        if (password.length >= 12) strength += 20;
        // 字符类型检查
        if (/[a-z]/.test(password)) strength += 15;
        if (/[A-Z]/.test(password)) strength += 15;
        if (/[0-9]/.test(password)) strength += 15;
        if (/[^a-zA-Z0-9]/.test(password)) strength += 15;

        return Math.min(strength, 100);
    }

    /**
     * 验证用户名
     */
    validateUsername(): void {
        const username = this.$data.form.username;
        if (username.length < 3) {
            this.$data.errors.username = '用户名至少3个字符';
        } else if (username.length > 16) {
            this.$data.errors.username = '用户名最多16个字符';
        } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            this.$data.errors.username = '用户名只能包含字母、数字和下划线';
        } else {
            this.$data.errors.username = '';
        }
        this.$data.passwordStrength = this.getPasswordStrength();
    }

    /**
     * 验证邮箱
     */
    validateEmail(): void {
        const email = this.$data.form.email;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            this.$data.errors.email = '请输入有效的邮箱地址';
        } else {
            this.$data.errors.email = '';
        }
    }

    /**
     * 验证密码
     */
    validatePassword(): void {
        const password = this.$data.form.password;
        if (password.length < 8) {
            this.$data.errors.password = '密码至少8个字符';
        } else if (password.length > 32) {
            this.$data.errors.password = '密码最多32个字符';
        } else {
            this.$data.errors.password = '';
        }
        this.$data.passwordStrength = this.getPasswordStrength();
    }

    /**
     * 验证确认密码
     */
    validateConfirmPassword(): void {
        const { password, confirmPassword } = this.$data.form;
        console.log('Validating confirm password:', confirmPassword);
        if (confirmPassword && confirmPassword !== password) {
            this.$data.errors.confirmPassword = '两次输入的密码不一致';
        } else {
            this.$data.errors.confirmPassword = '';
        }
    }

    /**
     * 验证验证码
     */
    validateCaptcha(): void {
        const captcha = this.$data.form.captcha;
        if (captcha.length !== 6) {
            this.$data.errors.captcha = '验证码为6位字符';
        } else {
            this.$data.errors.captcha = '';
        }
    }

    /**
     * 发送验证码
     */
    sendCaptcha(): void {
        if (this.$data.captchaCountdown > 0) return;

        // 验证邮箱是否有效
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.$data.form.email)) {
            this.$data.errors.email = '请先输入有效的邮箱地址';
            return;
        }

        this.$data.captchaCountdown = 60;

        const timer = setInterval(() => {
            this.$data.captchaCountdown--;
            if (this.$data.captchaCountdown <= 0) {
                clearInterval(timer);
            }
        }, 1000);

        console.log('验证码已发送: 123456');
    }

    /**
     * 检查表单是否有效
     */
    get isFormValid(): boolean {
        const { form, errors } = this.$data;
        return (
            form.username.length >= 3 &&
            form.username.length <= 16 &&
            !errors.username &&
            /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email) &&
            !errors.email &&
            form.password.length >= 8 &&
            form.password.length <= 32 &&
            !errors.password &&
            form.confirmPassword === form.password &&
            !errors.confirmPassword &&
            form.captcha.length === 6 &&
            form.agreeTerms
        );
    }

    /**
     * 提交表单
     */
    async submitForm(): Promise<void> {
        // 验证所有字段
        this.validateUsername();
        this.validateEmail();
        this.validatePassword();
        this.validateConfirmPassword();
        this.validateCaptcha();

        if (!this.isFormValid) return;

        this.$data.isSubmitting = true;

        // 模拟网络请求
        await new Promise(resolve => setTimeout(resolve, 2000));

        this.$data.isSubmitting = false;
        this.$data.isSuccess = true;

        console.log('表单提交成功！', this.$data.form);
    }
}

console.log('注册表单组件已注册！');
