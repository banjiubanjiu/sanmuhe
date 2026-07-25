---
target: 点单与商城页面
total_score: 18
p0_count: 1
p1_count: 3
timestamp: 2026-07-25T16-30-59Z
slug: sanmuhe-sanmuhe-miniprogram-pages-order-pages-shop
---
# 点单与商城页面联合审查

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---:|---|
| 1 | Visibility of System Status | 2 | 点单加入后只有短暂 toast，没有已选数量、金额与下一步 |
| 2 | Match System / Real World | 3 | 茶名与风味语言自然，但同一个“+”既可能加入也可能跳详情 |
| 3 | User Control and Freedom | 1 | 堂饮购物车没有任何可达入口 |
| 4 | Consistency and Standards | 1 | 点单与商城像两套产品，根 tab 还出现非标准返回箭头 |
| 5 | Error Prevention | 1 | 快速加入不阻止零库存，多规格动作未提前说明 |
| 6 | Recognition Rather Than Recall | 2 | 分类清晰，但用户必须猜已选堂饮茶去了哪里 |
| 7 | Flexibility and Efficiency | 2 | 商城有搜索和分类，分类内搜索与多规格跳转降低效率 |
| 8 | Aesthetic and Minimalist Design | 3 | 点单氛围成立，商城整洁但模板化且库存噪音偏多 |
| 9 | Error Recovery | 2 | 购物车能保留失败内容，但部分文案暴露“云服务” |
| 10 | Help and Documentation | 1 | “扫桌”时机与点单下一步都缺少必要引导 |
| **Total** |  | **18/40** | **Poor：主流程与一致性需在发布前修复** |

## Audit Health Score

| # | Dimension | Score | Key Finding |
|---|---|---:|---|
| 1 | Accessibility | 1 | 21–25px 触控区、无语义“+”、多处低对比文字 |
| 2 | Performance | 2 | 当前 13 项可运行，但图片无懒加载，搜索反复 setData 完整对象 |
| 3 | Responsive Design | 2 | 点单处理安全区，商城 custom nav 与浮层避让不完整 |
| 4 | Theming | 1 | 四组样式中有 114 个颜色字面量，无统一 token |
| 5 | Anti-Patterns | 2 | 两页均命中明确禁止的粗侧条 active 样式 |
| **Total** |  | **8/20** | **Poor：先修闭环与可访问性** |

## Anti-Patterns Verdict

**结论：不是粗糙 AI 直出，但像两套模板拼接。**

点单页的暖米色、深绿、茶席摄影和宋体标题形成了连续的禾煦气质；商城退回纯白、纯黑、灰搜索框和实心绿加号的通用商品列表。两页 active 分类都用 6rpx 彩色侧条，命中 Impeccable 明确禁项（`pages/order/index.wxss:112`、`pages/shop/index.wxss:104`）。全局宋体还渗透到搜索、按钮和 tab 等工具型文字（`app.wxss:1`）。

确定不存在的误报：没有 gradient text、glassmorphism、bounce/elastic 或 hero-metric 模板。点单的渐变图片遮罩不是渐变文字；商品卡重复有任务功能，不应仅凭重复判为 AI card grid。

自动 detector 已真实执行，但因 `bundled detector not found` 退出，无法提供规则计数，不能视为 clean scan。运行时改用微信开发者工具自动化、截图、节点尺寸、page data、console 与 exception 作为证据。

## Overall Impression

最大的机会不是继续美化卡片，而是先修复任务闭环。堂饮点单能把商品写入独立的 `dinein` 购物车，却没有任何进入该购物车或确认茶单的入口。视觉最完整的页面在最关键一步把用户留在原地。

## What's Working

1. 点单页先选茶席档位，再看具体茶款、风味与价格，信息顺序符合堂饮选择心理；模拟器中的 hero 与茶款列表层级清晰。
2. 商城左分类固定、右侧商品稳定呈现图片、名称、口感、产地与价格，首屏搜索入口明确，基础扫描效率不错。
3. 商城实际运行时成功加载 13 件云端商品，购物车数量、金额与 tab 高亮均正常，独立会话 console/exception 为空。
4. 包内业务图片整体较小，`app.json` 已启用 `lazyCodeLoading: "requiredComponents"`，预览包也正确忽略 admin 与 node_modules。

## Priority Issues

### [P0] 堂饮点单没有购物车或“确认茶单”入口

- **Location:** `pages/order/index.wxml:53`、`pages/order/index.js:193`、`utils/cart.js:3`
- **Impact:** 用户可以连续“加入茶单”，但无法查看、修改或确认堂饮订单，主任务无法完成。
- **Evidence:** 点单页只显示“已加入茶单”toast；全局 tabBar 不含购物车；首页和商城入口都固定进入 retail 购物车；`cart` 页虽支持 `mode=dinein`，界面却没有到达它的路径。
- **Fix:** 复用商城浮动购物车，在首次加入后显示“已选 N 道 / 合计 ¥X / 确认茶单”，跳转 `/pages/cart/index?mode=dinein`。
- **Suggested command:** `impeccable harden`

### [P1] 加号动作不可预测，库存约束缺失

- **Location:** `pages/shop/index.js:127`、`pages/shop/index.wxml:35`
- **Impact:** 单规格“+”直接加入，多规格同一个“+”却跳详情；零库存商品仍能快速加入，用户会在后续阶段才发现问题。
- **Fix:** 单规格保留加号；多规格显示“选规格”或 chevron；零库存显示不可点击“已售罄”，仅低库存时展示余量。
- **Suggested command:** `impeccable clarify`

### [P1] 触控、语义与对比度存在系统性无障碍问题

- **Location:** `pages/shop/index.wxss:231`、`pages/order/index.wxss:330`、`pages/order/index.wxml:5`、`pages/shop/index.wxml:3`
- **Impact:** 商城加号运行时仅 21×21px，点单加号约 25×25px，“扫桌”高度约 25px；大量 `<view bindtap>` 没有 button/aria 语义。低视力、读屏、运动障碍与单手用户都会受到影响。
- **Evidence:** 多组文字对比低于 4.5:1，例如商城空态 2.47:1、点单标签 3.34:1、价格单位 2.76:1。
- **Fix:** 点击区至少 44×44 CSS px；补齐 button 或 aria-role/aria-label；为选中状态增加非颜色线索；重新定义可读的次级文字 token。
- **Suggested command:** `impeccable audit`

### [P1] 商城悬浮购物车实际遮挡商品内容

- **Location:** `pages/shop/index.wxss:115`、`pages/shop/index.wxss:263`
- **Impact:** 运行时 pill 覆盖 y=718..777，而列表底部只有约 17px padding；截图中第五件商品标题已被遮挡，末项操作也可能无法舒适点击。
- **Fix:** `cartCount > 0` 时给 goods-list 增加 pill 高度、间距与 safe area 的动态底部留白；验证滚到最后一项。
- **Suggested command:** `impeccable adapt`

### [P2] 品牌、导航与状态语言不统一

- **Location:** `pages/shop/index.wxss:1`、`app.wxss:1`、`pages/shop/index.wxml:2`、`pages/shop/index.wxss:64`
- **Impact:** 点单像禾煦品牌空间，商城像通用外卖列表。商城作为根 tab 却带自制字符返回箭头；固定 `88rpx` 和 `top:270rpx` 未按真实状态栏高度计算。
- **Fix:** 宋体只用于品牌标题与茶名，系统黑体用于控件；统一暖调 surface、深绿 action、圆角与状态；移除根 tab 返回箭头；复用点单的动态状态栏与胶囊尺寸计算；建立小程序端 DESIGN.md。
- **Suggested command:** `impeccable polish`

## Cognitive Load

中等，8 项中失败 3 项：

- 单一焦点失败：点单加入后没有显性下一步。
- 最少选择失败：点单首层 5 档、商城 6 分类，缺少推荐或分组。
- 渐进披露失败：多规格商品仍显示与单规格相同的“+”。

商品信息分组、当前分类可见性、名称/产地/口感的同屏呈现则做得较好。

## Emotional Journey

点单开始时的暖色摄影和“初见”命名带来平静感；点击加号形成短暂高点，但 toast 消失后页面完全不变，没有数量、金额或下一步，终点缺失反而覆盖前面的品牌好感。

商城搜索与分类让用户快速进入任务，浮动购物车也是有效的安心信号；但 exact stock 像后台字段，多规格“+”突然跳详情，浮层又遮住内容，连续性被打断。

## Persona Red Flags

**Casey（分心的移动用户）**

- 21–25px 的加号不适合单手拇指。
- 点单加入后看不到已选状态，切走再回来也不知道之前选了什么。
- 商城购物车浮层遮挡商品；商品图无 lazy-load/占位，慢网体验容易抖动。

**Riley（边界测试用户）**

- 会立即发现多规格和单规格的同一“+”产生不同结果。
- 会测试库存为 0 的商品，目前快速加入没有阻止。
- 在“红茶”分类搜索“白茶”只得到空结果，却不知道搜索仍受分类限制。
- 会看到提交失败文案中的“云服务”内部术语。

**Jordan（首次使用用户）**

- 能理解如何选茶，却无法在 5 秒内找到如何完成点单。
- “扫桌”没有说明何时必须扫、是否可以稍后扫。
- 商城根 tab 的返回箭头暗示次级页面，实际却切到首页。
- 空搜索只有说明文字，没有直接可点的恢复动作。

## Minor Observations

- 左栏“烹茶暖叙”“芳茗润茶”在窄栏中强制换行，节奏明显不同。
- 18–22rpx 的茶类竖排字、标签与单位在低视力场景偏小。
- “可售 200”在每件商品重复出现，正常库存无需打断用户，只展示“余量紧张/售罄”更有价值。
- 商城左侧 active“全部”和右侧标题“全部”重复，信息收益很低。
- 搜索实际是“当前分类内搜索”，placeholder 却像全商城搜索；应自动切全部或明确范围。
- 商城 `getCatalog().then(...)` 没有显式错误分支；当前 fallback 避免空白，但用户不知道数据是否刷新。

## Questions to Consider

1. 堂饮的核心单位到底是“档位”还是“茶款”？如果顾客主要按口感选茶，第一层为什么是“初见 / 知味 / 臻藏”这类需要解释的内部命名？
2. 商城展示“可售 200”的产品目的是什么？如果只是把库存字段搬到前台，应删除。
3. 点单与商城应当是“一家店的两种购买方式”还是两个故意不同的空间？若是前者，字体、色彩、导航与反馈必须合并成一套系统。
