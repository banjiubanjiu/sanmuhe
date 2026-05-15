# 如何找到微信小程序 AppID 和云开发 envId

## AppID

方式一：微信公众平台

1. 打开微信公众平台并登录小程序账号。
2. 进入「设置」。
3. 打开「基本设置」。
4. 找到「账号信息」里的 `AppID(小程序ID)`。

方式二：微信开发者工具

1. 用真实小程序账号打开项目。
2. 顶部或侧边栏打开「详情」。
3. 在「基本信息」中查看 AppID。

注意：`touristappid`、测试号、模板项目 AppID 都不能直接用于三木合正式云开发。

## 云开发 envId

1. 用真实 AppID 打开微信开发者工具。
2. 点击工具栏里的「云开发」。
3. 如果还没有环境，按提示创建一个环境。
4. 进入云开发控制台后，在环境下拉框或环境设置中复制「环境 ID」。

常见格式类似：

```text
xxx-1gxxxxxx
prod-xxxxxx
cloud1-xxxxxx
```

## 填入三木合项目

拿到 AppID 和 envId 后，双击：

```text
F:\sanmuhe\configure-cloud.bat
```

或者走完整流程：

```text
F:\sanmuhe\sanmuhe-cloud-preview.bat
```

完整流程会写入配置、打开微信开发者工具、部署云函数并生成预览二维码。

## 配置后检查

双击：

```text
F:\sanmuhe\verify-cloud-migration.bat
```

如果配置正确，应看到：

```json
{
  "codeReady": true,
  "readyForCloudPreview": true
}
```
