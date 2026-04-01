import { Router, createRouter, getRouter, routerReady } from './core';
import RouterView from './router-view';
import RouterLink from './router-link';
import type { RouteConfig, RouteMatch, NavigationGuard, RouterOptions, NavigationResult } from './types';

export { Router, RouterView, RouterLink, createRouter, getRouter, routerReady };

export type { RouteConfig, RouteMatch, NavigationGuard, RouterOptions, NavigationResult };
