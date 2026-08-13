# createPayment 部署

不要对本目录执行 `tcb fn deploy createPayment --force`。

仓库 `cloudbaserc.json` 只有 AppID / 商户号 / 回调，没有私钥和平台公钥。
全量 deploy 会覆盖云端环境变量，微信支付会报「环境变量未配置」。

```bash
# 在仓库根目录
./scripts/deploy-cloudfunctions-safe.sh createPayment
```
