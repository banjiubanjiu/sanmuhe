# Design System

## Theme

自然雅致的浅色产品界面。暖纸白提供安静背景，墨绿只用于当前状态和主操作，砂金用于会员与品牌细节，赭红只用于风险与售后。

## Color Palette

- Background: `#F7F4EC`
- Surface: `#FFFDF8`
- Primary ink: `#173B2A`
- Secondary ink: `#6F685F`
- Tea brown: `#6F5635`
- Sand gold: `#C6A66A`
- Danger: `#A64B3C`
- Divider: `#E8E1D5`

## Typography

- Display and page titles: `"Songti SC", "STSong", "Noto Serif CJK SC", "Source Han Serif SC", "SimSun", serif`
- Product labels, statuses and controls: inherit the established mini program font stack for reliable Chinese rendering
- Monetary values: `"DIN Alternate", "Georgia", "Times New Roman", serif`

## Layout

- Page horizontal padding: `28rpx`
- Primary section gap: `28–36rpx`
- Dense metadata gap: `8–16rpx`
- Touch targets: at least `80rpx`
- Use continuous lists for repeated records; reserve elevated surfaces for meaningful grouping
- Fixed bottom action bars use safe-area padding

## Components

- Status pill: tinted background plus text label; never color-only
- Order row: status header, product summary, fulfillment metadata, amount and contextual actions
- Timeline: leading dots and a single 1rpx guide, with the newest meaningful state emphasized
- Empty/error state: explain what happened and provide one useful next action
- Primary button: solid ink green; secondary button: warm surface with full border; destructive button: restrained red text and border

## Motion

Use only pressed-state feedback and short state transitions. Avoid decorative page-load sequences.
