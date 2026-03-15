import { BaseElement, CustomElement } from '../../src/index.ts';
import template from './index.html?raw';
import styles from './index.css?raw';

interface WeatherData {
  city: string;
  country: string;
  temperature: number;
  condition: string;
  conditionText: string;
  humidity: number;
  windSpeed: number;
  visibility: number;
  uvIndex: string;
  forecast: Array<{
    day: string;
    high: number;
    low: number;
    condition: string;
  }>;
}

@CustomElement({
  tagName: 'weather-app',
  template,
  styles,
  shadowDOM: { use: true }
})
class WeatherApp extends BaseElement<{
  city: string;
  isLoading: boolean;
  error: string;
  weatherData: WeatherData | null;
  lastUpdate: string;
  hotCities: string[];
}> {
  constructor() {
    super({
      city: '',
      isLoading: false,
      error: '',
      weatherData: null,
      lastUpdate: '',
      hotCities: ['北京', '上海', '广州', '深圳', '杭州', '成都']
    });
  }

  getWeatherEmoji(condition: string): string {
    const conditionMap: { [key: string]: string } = {
      '晴': '☀️',
      '多云': '⛅',
      '阴': '☁️',
      '雨': '🌧️',
      '雪': '❄️',
      '雷': '⛈️',
      '雾': '🌫️',
      '霾': '😷'
    };
    return conditionMap[condition] || '🌤️';
  }

  getDayName(index: number): string {
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    const today = new Date().getDay();
    return days[(today + index) % 7];
  }

  async searchWeather() {
    if (!this.$data.city.trim() || this.$data.isLoading) return;

    this.$data.isLoading = true;
    this.$data.error = '';

    try {
      await this.fetchWeatherData(this.$data.city);
    } catch (err) {
      this.$data.error = `无法获取 "${this.$data.city}" 的天气数据，请检查城市名称是否正确`;
    } finally {
      this.$data.isLoading = false;
    }
  }

  async fetchWeatherData(city: string) {
    await new Promise(resolve => setTimeout(resolve, 1500));

    const cities: { [key: string]: any } = {
      '北京': { city: '北京', country: '中国', temperature: 22, condition: '晴', humidity: 45, windSpeed: 12, visibility: 10, uvIndex: '强' },
      '上海': { city: '上海', country: '中国', temperature: 20, condition: '多云', humidity: 68, windSpeed: 15, visibility: 8, uvIndex: '中等' },
      '广州': { city: '广州', country: '中国', temperature: 28, condition: '雨', humidity: 82, windSpeed: 8, visibility: 6, uvIndex: '弱' },
      '深圳': { city: '深圳', country: '中国', temperature: 27, condition: '多云', humidity: 75, windSpeed: 10, visibility: 7, uvIndex: '中等' },
      '杭州': { city: '杭州', country: '中国', temperature: 19, condition: '阴', humidity: 72, windSpeed: 14, visibility: 5, uvIndex: '弱' },
      '成都': { city: '成都', country: '中国', temperature: 18, condition: '雾', humidity: 88, windSpeed: 6, visibility: 4, uvIndex: '弱' }
    };

    const defaultWeather = {
      city: city,
      country: '中国',
      temperature: Math.floor(Math.random() * 30) + 5,
      condition: ['晴', '多云', '阴', '雨'][Math.floor(Math.random() * 4)],
      humidity: Math.floor(Math.random() * 50) + 40,
      windSpeed: Math.floor(Math.random() * 20) + 5,
      visibility: Math.floor(Math.random() * 10) + 5,
      uvIndex: ['弱', '中等', '强'][Math.floor(Math.random() * 3)]
    };

    const weather = cities[city] || defaultWeather;

    const forecast = [];
    for (let i = 0; i < 7; i++) {
      forecast.push({
        day: ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][(new Date().getDay() + i) % 7],
        high: weather.temperature + Math.floor(Math.random() * 10) - 5,
        low: weather.temperature - Math.floor(Math.random() * 10) - 5,
        condition: ['晴', '多云', '阴', '雨'][Math.floor(Math.random() * 4)]
      });
    }

    this.$data.weatherData = {
      ...weather,
      conditionText: this.getConditionText(weather.condition),
      forecast: forecast
    };
    this.$data.lastUpdate = new Date().toLocaleString('zh-CN');

    console.log('Weather data fetched:', this.$data.weatherData);
  }

  getConditionText(condition: string): string {
    const textMap: { [key: string]: string } = {
      '晴': '晴天',
      '多云': '多云',
      '阴': '阴天',
      '雨': '小雨',
      '雪': '小雪',
      '雷': '雷阵雨',
      '雾': '雾天',
      '霾': '霾'
    };
    return textMap[condition] || condition;
  }

  searchCity(city: string) {
    this.$data.city = city;
    this.searchWeather();
  }

  clearError() {
    this.$data.error = '';
  }

  async refresh() {
    if (this.$data.city) {
      await this.searchWeather();
    }
  }
}

console.log('Weather app component registered successfully!');
