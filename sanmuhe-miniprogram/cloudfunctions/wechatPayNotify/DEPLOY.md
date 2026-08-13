# wechatPayNotify 部署

不要对本目录执行 `tcb fn deploy wechatPayNotify --force`。

仓库 `cloudbaserc.json` 不含 APIv3 密钥和平台公钥。全量 deploy 会冲掉回调验签配置。

```bash
./scripts/deploy-cloudfunctions-safe.sh wechatPayNotify
```
