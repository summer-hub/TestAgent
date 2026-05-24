/**
 * AppManager — HarmonyOS 应用管理器
 *
 * 基于 HarmonyOS 原生命令 (bm / aa / pm) 的完整应用生命周期管理。
 *
 * 用法:
 * ```typescript
 * const app = await AppManager.create(driver);
 * await app.start('com.example.stackblur');
 * const info = await app.getAppInfo('com.example.stackblur');
 * const all = await app.listApps({ thirdPartyOnly: true });
 * await app.clearData('com.example.stackblur');
 * ```
 */

import type { HypiumDriver } from '../driver/hypium-driver';
import {
  AppInfo,
  AppSource,
  AbilityType,
  AbilityInfo,
  AbilitySkill,
  HapModuleInfo,
  AbilityVisibility,
  AbilityLaunchType,
  AppListQuery,
  InstallResult,
  AppProcessStatus,
  AppRuntimeInfo,
} from '@core/types/app-info.type';

/**
 * AppManager
 */
export class AppManager {
  /** 已缓存的应用信息 (按 bundleName 索引) */
  private cache = new Map<string, AppInfo>();
  private driver: HypiumDriver;

  private constructor(driver: HypiumDriver) {
    this.driver = driver;
  }

  /** 创建 AppManager 实例 */
  static create(driver: HypiumDriver): AppManager {
    return new AppManager(driver);
  }

  // ============ 应用信息 ============

  /**
   * 获取单个应用详细信息
   * 使用 `bm dump -n <bundleName>` 获取完整 JSON
   */
  async getAppInfo(bundleName: string, useCache: boolean = true): Promise<AppInfo> {
    if (useCache && this.cache.has(bundleName)) {
      return this.cache.get(bundleName)!;
    }

    const raw = await this._execShell(`bm dump -n ${bundleName}`);
    const appInfo = this._parseBmDump(raw, bundleName);
    this.cache.set(bundleName, appInfo);
    return appInfo;
  }

  /**
   * 列出所有已安装应用
   */
  async listApps(query?: AppListQuery): Promise<AppInfo[]> {
    // 用 bm dump -a 列出所有包名
    const raw = await this._execShell('bm dump -a');
    const bundleNames = this._parseBundleList(raw);

    if (query?.filterKeyword) {
      const kw = query.filterKeyword.toLowerCase();
      // 只过滤包名，然后逐个获取详情
      const filteredNames = bundleNames.filter(n => n.toLowerCase().includes(kw));
      const results = await Promise.allSettled(
        filteredNames.map(n => this.getAppInfo(n))
      );
      return results
        .filter((r): r is PromiseFulfilledResult<AppInfo> => r.status === 'fulfilled')
        .map(r => r.value);
    }

    if (query?.thirdPartyOnly) {
      // 系统包名特征: ohos. / com.huawei.hmos. / com.ohos.
      const thirdParty = bundleNames.filter(n =>
        !n.startsWith('ohos.') &&
        !n.startsWith('com.huawei.hmos.') &&
        !n.startsWith('com.ohos.') &&
        !n.startsWith('com.huawei.permission') &&
        !n.startsWith('com.huawei.hsystems.')
      );
      const top = thirdParty.slice(0, 20);
      const results = await Promise.allSettled(
        top.map(n => this.getAppInfo(n))
      );
      return results
        .filter((r): r is PromiseFulfilledResult<AppInfo> => r.status === 'fulfilled')
        .map(r => r.value);
    }

    // 默认只返回前 20 个 (避免大量接口调用)
    const top = bundleNames.slice(0, 20);
    const results = await Promise.allSettled(
      top.map(n => this.getAppInfo(n))
    );
    return results
      .filter((r): r is PromiseFulfilledResult<AppInfo> => r.status === 'fulfilled')
      .map(r => r.value);
  }

  /**
   * 清除应用缓存
   */
  clearCache(bundleName?: string): void {
    if (bundleName) {
      this.cache.delete(bundleName);
    } else {
      this.cache.clear();
    }
  }

  // ============ 应用生命周期 ============

  /**
   * 启动应用 (通过 aa start)
   *
   * 自动检测 mainAbility — 无需手动传入 abilityName
   */
  async start(bundleName: string, abilityName?: string): Promise<void> {
    const ability = abilityName || await this._detectMainAbility(bundleName);
    if (ability) {
      await this._execShell(`aa start -a ${ability} -b ${bundleName}`);
    } else {
      await this._execShell(`aa start -b ${bundleName}`);
    }
    await this.driver.sleep(2000);
  }

  /**
   * 停止应用
   */
  async stop(bundleName: string): Promise<void> {
    await this._execShell(`aa force-stop ${bundleName}`);
  }

  /**
   * 重启应用
   */
  async restart(bundleName: string, abilityName?: string): Promise<void> {
    await this.stop(bundleName);
    await this.driver.sleep(500);
    await this.start(bundleName, abilityName);
  }

  /**
   * 清除应用数据
   */
  async clearData(bundleName: string): Promise<void> {
    await this._execShell(`pm clear ${bundleName}`);
  }

  // ============ 应用安装 ============

  /**
   * 安装 HAP 包
   * @param hapPaths HAP 文件路径 (设备端)
   */
  async install(hapPaths: string[]): Promise<InstallResult> {
    const pathArg = hapPaths.join(' ');
    const output = await this._execShell(`bm install -p ${pathArg}`).catch((e) => `ERROR: ${e.message}`);
    const success = !output.toUpperCase().includes('ERROR') && !output.includes('FAILED');

    // 从路径中猜测包名
    const bundleName = hapPaths[0]?.split('/').pop()?.replace('.hap', '') || '';
    return { success, bundleName, output };
  }

  /**
   * 卸载应用
   */
  async uninstall(bundleName: string): Promise<InstallResult> {
    const output = await this._execShell(`bm uninstall -n ${bundleName}`).catch((e) => `ERROR: ${e.message}`);
    const success = !output.toUpperCase().includes('ERROR') && !output.includes('FAILED');
    this.cache.delete(bundleName);
    return { success, bundleName, output };
  }

  // ============ 应用运行时信息 ============

  /**
   * 获取应用运行状态
   */
  async getAppStatus(bundleName: string): Promise<AppProcessStatus> {
    // 直接用 ps -ef 获取全部进程，JS 端过滤 (避免 shell pipe 在 Windows 被拦截)
    const ps = await this._execShell('ps -ef');
    if (!ps || ps.trim().length === 0) return AppProcessStatus.NOT_RUNNING;

    const lines = ps.split('\n').filter(l => l.includes(bundleName) && !l.includes('grep'));
    if (lines.length === 0) return AppProcessStatus.NOT_RUNNING;

    // 查看是否有前台 activity
    try {
      const focus = await this._execShell('aa dump -f');
      if (focus.includes(bundleName)) return AppProcessStatus.FOREGROUND;
    } catch {}
    return AppProcessStatus.BACKGROUND;
  }

  /**
   * 获取所有运行中的应用
   */
  async getRunningApps(): Promise<AppRuntimeInfo[]> {
    const ps = await this._execShell('ps -ef');
    const lines = ps.split('\n').filter(l => !l.includes('grep'));
    const result: AppRuntimeInfo[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 2) continue;
      const pid = parseInt(parts[1], 10);
      if (isNaN(pid)) continue;
      // 尝试从最后部分提取 bundleName 特征
      const fullText = line;
      // 只保留第三方应用进程
      if (fullText.includes('com.') || fullText.includes('ohos.')) {
        // 简化: 只记录进程名
        const name = parts[parts.length - 1] || '';
        result.push({
          bundleName: name,
          pid,
          status: AppProcessStatus.BACKGROUND,
          memoryKB: 0,
          foregroundTimeMs: 0,
        });
      }
    }
    return result;
  }

  // ============ 私有方法 ============

  private async _execShell(command: string): Promise<string> {
    return this.driver.executeShell(command);
  }

  private async _detectMainAbility(bundleName: string): Promise<string | null> {
    try {
      const info = await this.getAppInfo(bundleName);
      return info.mainAbility?.name || null;
    } catch {
      // fallback: 尝试通用格式
      return `${bundleName}.EntryAbility`;
    }
  }

  /**
   * 解析 bm dump -n <bundleName> 输出
   */
  private _parseBmDump(raw: string, bundleName: string): AppInfo {
    // 提取 JSON 部分 (去掉 "com.example.xxx:\n" 前缀)
    const jsonStr = raw.substring(raw.indexOf('{'));
    const data = JSON.parse(jsonStr);

    const appInfoData = data.applicationInfo || {};
    const hapModules = data.hapModuleInfos || [];

    // 解析所有 HAP 模块
    const modules: HapModuleInfo[] = hapModules.map((hmod: any) =>
      this._parseHapModule(hmod)
    );

    // 扁平化所有 abilities
    const allAbilities: AbilityInfo[] = [];
    for (const mod of modules) {
      for (const ab of mod.abilities) {
        allAbilities.push(ab);
      }
    }

    // 主 Ability = entry 模块的 mainAbility
    const entryModule = modules.find(m => m.moduleName === data.entryModuleName);
    const mainAbilityName = entryModule?.mainAbility;
    const mainAbility = allAbilities.find(a => a.name === mainAbilityName) || null;

    return {
      bundleName: data.name || bundleName,
      appName: data.label || bundleName,
      vendor: data.vendor || appInfoData.vendor || '',
      versionName: data.versionName || '',
      versionCode: data.versionCode || 0,
      iconId: appInfoData.iconId || 0,
      labelId: appInfoData.labelId || 0,
      minSdkVersion: data.minSdkVersion ?? -1,
      maxSdkVersion: data.maxSdkVersion ?? -1,
      source: data.isPreInstallApp ? AppSource.PRE_INSTALLED : AppSource.USER_INSTALLED,
      installed: true,
      enabled: appInfoData.enabled !== false,
      isSystemApp: appInfoData.isSystemApp === true,
      removable: data.hapModuleInfos?.[0]?.isRemovable !== false,
      modules,
      abilities: allAbilities,
      mainAbility,
      raw: data,
    };
  }

  /**
   * 解析 bm dump -a 输出 — 获取包名列表
   * 格式:
   *   ID: 100:
   *   	com.example.app1
   *   	com.example.app2
   */
  private _parseBundleList(raw: string): string[] {
    const names: string[] = [];
    for (const line of raw.split('\n')) {
      const name = line.trim();
      if (name && !name.startsWith('ID:') && !name.startsWith('OK') && !name.startsWith('error')) {
        names.push(name);
      }
    }
    return names;
  }

  /**
   * 解析单个 HAP 模块
   */
  private _parseHapModule(hmod: any): HapModuleInfo {
    const abilities: AbilityInfo[] = (hmod.abilityInfos || []).map((ab: any) =>
      this._parseAbility(ab)
    );

    return {
      moduleName: hmod.moduleName || '',
      mainAbility: hmod.mainAbility || '',
      description: hmod.description || '',
      supportedDeviceTypes: hmod.deviceTypes || [],
      abilities,
      raw: hmod,
    };
  }

  /**
   * 解析单个 Ability
   */
  private _parseAbility(ab: any): AbilityInfo {
    const typeMap: Record<number, AbilityType> = {
      1: AbilityType.PAGE,
      2: AbilityType.SERVICE,
      3: AbilityType.DATA,
      4: AbilityType.FORM,
    };

    const skills: AbilitySkill[] = (ab.skills || []).map((sk: any) => ({
      action: (sk.actions || [])[0] || '',
      uri: (sk.uris || [])[0]?.scheme || '',
      type: sk.type || '',
      entities: sk.entities || [],
    }));

    return {
      name: ab.name || '',
      className: ab.name || '',
      type: typeMap[ab.type] || AbilityType.UNKNOWN,
      visibility: ab.visible ? AbilityVisibility.PUBLIC : AbilityVisibility.PRIVATE,
      launchType: ab.launchMode === 0 ? AbilityLaunchType.SINGLETON : AbilityLaunchType.MULTITON,
      isMainEntry: (ab.skills || []).some((sk: any) =>
        (sk.actions || []).includes('ohos.want.action.home')
      ),
      visible: ab.visible !== false,
      supportedDevices: ab.deviceTypes || [],
      description: ab.description || '',
      skills,
      raw: ab,
    };
  }
}
