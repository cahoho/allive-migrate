# Allive Migration · 众生迁徙 — AI 音乐策划案 v3.0

> **文档定位**：面向 Suno / Udio / MPS 音频生成工具的完整 AI 音乐与音效提示词策划案
> **项目**：《Allive Migration · 众生迁徙》生物多样性保护主题网页公益游戏
> **版本**：v3.0 · 2026-06-23
> **核心叙事**：生态链越完整，音乐越丰富；物种减少，音乐越稀薄
> **音乐架构**：1 条主旋律 + 8 个物种装饰音 = 最多 9 种乐器同时演奏
> **前置文档**：`audio-system-gdd.md`（音频系统架构 GDD）

---

## 目录

- [一、音乐总架构说明](#一音乐总架构说明)
- [二、主旋律规划](#二主旋律规划)
  - [2.1 主旋律设计概要](#21-主旋律设计概要)
  - [2.2 主旋律英文提示词](#22-主旋律英文提示词)
- [三、物种专属乐器配置](#三物种专属乐器配置)
- [四、八物种装饰音轨提示词](#四八物种装饰音轨提示词)
  - [4.1 雁鸭候鸟](#41-雁鸭候鸟)
  - [4.2 帝王蝶](#42-帝王蝶)
  - [4.3 斑头雁](#43-斑头雁)
  - [4.4 鲑鱼](#44-鲑鱼)
  - [4.5 角马兽群](#45-角马兽群)
  - [4.6 美洲鳗](#46-美洲鳗)
  - [4.7 绿海龟](#47-绿海龟)
  - [4.8 林蛙](#48-林蛙)
  - [4.9 物种音轨动态规则汇总](#49-物种音轨动态规则汇总)
- [五、音效设计提示词](#五音效设计提示词)
  - [5.1 通用交互音效（三个）](#51-通用交互音效三个)
  - [5.2 物种专属声音（八个）](#52-物种专属声音八个)
- [六、统一混音规则](#六统一混音规则)
- [七、游戏接入建议](#七游戏接入建议)
- [八、AI 音频创作证据表](#八ai-音频创作证据表)
- [九、质量检查清单](#九质量检查清单)

---

## 一、音乐总架构说明

### 完整音乐层构成

整个游戏的 BGM 由以下 9 个独立音频文件叠加组成：

| 层编号 | 文件 | 乐器 | 说明 |
|--------|------|------|------|
| 0 | `main_theme_loop.wav` | marimba + piano + harp + glass pad + strings + woodwinds | **主旋律层**，始终存在，象征生态链本身 |
| 1 | `stem_bird.wav` | Alto Flute（中音长笛） | 雁鸭候鸟装饰音 |
| 2 | `stem_butterfly.wav` | Glockenspiel（钟琴） | 帝王蝶装饰音 |
| 3 | `stem_bar_goose.wav` | Piccolo（短笛） | 斑头雁装饰音 |
| 4 | `stem_salmon.wav` | Cello Solo（大提琴独奏） | 鲑鱼装饰音 |
| 5 | `stem_herd.wav` | Viola（中提琴） | 角马兽群装饰音 |
| 6 | `stem_eel.wav` | Bass Clarinet（低音单簧管） | 美洲鳗装饰音 |
| 7 | `stem_sea_turtle.wav` | Celesta（钢片琴） | 绿海龟装饰音 |
| 8 | `stem_wood_frog.wav` | Kalimba（卡林巴琴） | 林蛙装饰音 |

### 装饰音设计原则

**目标：每个装饰音轨必须满足两个条件——**

1. **普适性**：可以独立于任何游戏时机播放。无论玩家当前在做什么（拖动路线、等待、查看地图），装饰音都不会显得突兀或"错位"。
2. **易于卡点**：音轨内部包含天然的进入点（如小节开头、短暂停顿前）。物种解锁时，淡入起始点在音轨的最近一个"安静窗口"处触发，不会切入演奏中途。

**实现方式**：
- 所有装饰音轨都有大量留白（30%–60% 的时间是静默或极轻的），留白位置就是进入/退出的最佳卡点
- 装饰音轨的节奏不与主旋律紧耦合，不需要严格的 beat 对齐也能听起来自然
- 每条装饰音轨在循环尾部均有明显的"呼吸/停顿"，游戏逻辑可在此处触发淡入或淡出

---

## 二、主旋律规划

### 2.1 主旋律设计概要

主旋律是整个游戏的"生态链之声"——它始终存在，象征自然生态本身。八个物种的装饰音轨叠加其上，而非取代它。当物种减少时，主旋律仍在，但装饰层褪去，听感从"丰饶"变为"空旷"；当物种丰富时，主旋律被装饰层环绕，听感从"孤独"变为"生机盎然"。

| 参数 | 设定值 | 设计意图 |
|------|--------|----------|
| **Key / Mode** | D major with Lydian color（D 大调 + 利底亚色彩） | Lydian 的升 4 度（G♯）赋予"明亮中带有好奇"的色彩，避免纯大调的甜腻 |
| **BPM** | 87 | 既不急促也不拖沓，匹配"迁徙行走"的自然步频 |
| **Time Signature** | 4/4 | 嵌入 3+3+2 分组制造"行走律动"，但不用标准 4-on-the-floor 底鼓 |
| **Loop Length** | 75 seconds | 足够展开一个完整情绪弧线，又不至于让玩家察觉循环 |
| **Melody Range** | D4–A5（中高音区） | 避免低频拥挤，将低频空间留给鲑鱼、角马等物种装饰轨 |
| **Texture** | marimba + soft piano + harp + glass pad + warm strings + light woodwinds | 透明、层叠但不拥挤的室内乐质感 |
| **核心进行** | I → vi → IV → V（D → Bm → G → A），间插 sus2/sus4 挂留 | 永远"在迁徙中"，不落稳定终止式 |

**Mood Arc 设计**（75 秒循环内）：

| 时间段 | 情绪 | 音乐表现 |
|--------|------|----------|
| 0–20s | 清澈探索 | marimba 独奏主题动机，glass pad 极轻铺底，空间感大 |
| 20–45s | 生态逐渐展开 | soft piano 加入和声填充，light woodwinds 呼应旋律，层次增加但不厚重 |
| 45–65s | 温暖上扬 | warm strings 长弓铺底，harp 琶音装饰，旋律上行至 A5 附近后回落 |
| 65–75s | 可循环终止点 | 所有乐器渐弱至 marimba 独奏，尾音悬停在属音（A）上，无缝接回开头 |

---

### 2.2 主旋律英文提示词

以下提示词可直接复制到 Suno / Udio 的 prompt 输入框中使用。

**【Suno / Udio 主旋律提示词】**

```
Instrumental only, seamless loop, no vocals, no lyrics.
Ecological migration puzzle game soundtrack.
Key: D major with Lydian color (raised 4th).
BPM: 87. Time signature: 4/4. Loop length: 75 seconds.
Instrumentation: marimba, soft felt piano, harp, glass pad, warm cello section, light woodwinds (alto flute).
Texture: transparent chamber ensemble, layered but not crowded, every instrument has its own frequency pocket.
Rhythm: gentle 3+3+2 grouping embedded in 4/4, no four-on-the-floor kick, no standard drum beat.
Percussive elements only from marimba strikes and harp plucks.
Mood arc: 0-20s sparse marimba solo with glass pad drone, clear and exploratory.
20-45s soft piano enters with harmonic fills, woodwinds echo the melody, texture gradually thickens.
45-65s warm strings sustain long bows, harp arpeggios decorate, melody rises toward A5 then descends.
65-75s all instruments fade back to marimba solo, final note suspends on the fifth (A), seamless loop point.
Mixing: marimba at center -3dB, piano slightly left -5dB, harp slightly right -6dB,
glass pad wide stereo -10dB, strings centered -7dB, woodwinds panned right -8dB.
Reverb: medium hall, 1.8s decay, 30% wet.
Clear melodic motif throughout, transparent orchestration.
Negative prompt: no vocals, no lyrics, no cinematic trailer drums, no aggressive EDM,
no distorted guitars, no heavy bass, no epic orchestral crescendo, no battle music,
no horror dissonance, no four-on-the-floor beat, no 808, no electric guitar,
no synth lead, no clipping, no lo-fi artifacts.
```

**中文解释**：纯器乐无缝循环，D 大调利底亚色彩，87 BPM，4/4 拍，75 秒循环。乐器配置为马林巴琴、柔音钢琴、竖琴、玻璃质感合成铺底、温暖弦乐组和轻柔木管。织体透明、层叠但不拥挤。节奏采用 3+3+2 分组嵌入 4/4 拍内，无标准鼓点，律动仅来自马林巴琴敲击和竖琴拨弦。情绪弧线从清澈探索到生态展开再到温暖上扬，最后回到可循环终止点。

---

## 三、物种专属乐器配置

每个物种分配一种代表性乐器，不可重复。乐器选择基于物种体型、迁徙方式、速度、生态位和气质的映射关系。

| # | 物种名称 | 乐器名称 | 频段 | 选配理由 |
|---|---------|---------|------|----------|
| 1 | **雁鸭候鸟** | **Alto Flute（中音长笛）** | 250Hz–3kHz | 候鸟飞行在空中，中音长笛的音色清澈、流畅、带有呼吸感，能自然模拟翅膀拍打的节奏断奏。"气声"特质与湿地水汽、高空风声在听觉上自然关联。 |
| 2 | **帝王蝶** | **Glockenspiel（钟琴）** | 2kHz–8kHz | 帝王蝶体型极小、翅膀振动极快，气质脆弱而闪烁。钟琴的金属高频点状短音像露珠滴落或翅膀鳞片反光，与蝴蝶的视觉感受完全对应。 |
| 3 | **斑头雁** | **Piccolo（短笛）** | 3kHz–7kHz | 斑头雁能飞越极高海拔高山通道，速度最快。短笛是音域最高的木管乐器，音色极亮、带有穿透力，对应"在高空稀薄空气中飞行"的气质。 |
| 4 | **鲑鱼** | **Cello Solo（大提琴独奏）** | 80Hz–400Hz | 鲑鱼逆流洄游，体形流线、力量感强。大提琴独奏频段深沉，有拨弦与拉弦交替的质感，对应"在水中持续逆流推进"的力量感。 |
| 5 | **角马兽群** | **Viola（中提琴）** | 150Hz–800Hz | 角马集群迁徙，体型笨重但有群感。中提琴音色温暖，用持续长音制造"踏步感"律动，对应角马"慢但坚定"的迁徙气质。 |
| 6 | **美洲鳗** | **Bass Clarinet（低音单簧管）** | 120Hz–1.5kHz | 美洲鳗夜行性、蛇形游动，气质暗色而滑腻。低音单簧管音色暗哑、带有滑音质感，对应"在水下暗色潜行"的生态位。 |
| 7 | **绿海龟** | **Celesta（钢片琴）** | 2kHz–6kHz | 绿海龟速度慢，古老而温和。钢片琴的冷冽高频点状音对应海龟"在海面上缓慢游弋、偶尔浮出水面呼吸"的稀疏节奏。 |
| 8 | **林蛙** | **Kalimba（卡林巴琴/拇指琴）** | 300Hz–3kHz | 林蛙速度最慢，体型极小、两栖。卡林巴琴的短促湿润颗粒音对应林蛙"在湿润林地中短距离跳跃"的听觉感受。 |

**频段生态位互补图**：

```
频段 (Hz)
7kHz+ ─────────── Glockenspiel (帝王蝶) ─── Piccolo (斑头雁) ─── Celesta (海龟)
3kHz  ─── Alto Flute (候鸟) ─── Kalimba (林蛙)
1kHz  ─── Bass Clarinet (鳗鱼)
400Hz ─── Viola (角马)
200Hz ─── Cello Solo (鲑鱼)
80Hz  ──────────────────────────────────────────────────
      └── 低频独占区 ── 中频填充区 ── 高频闪烁区 ── 极高频点缀区
```

> 8 个物种的频段从 80Hz 到 8kHz+ 形成轮盘式分布，任意两个物种同时演奏时频段不严重重叠。

---

## 四、八物种装饰音轨提示词

以下每个物种的音轨都不是独立 BGM，而是可以叠加在主旋律之上的 **species stem / ornament layer**。它们与主旋律共享 D 大调调性中心，BPM 兼容（82–92 区间，可使用 half-time 或 double-time），频段互不抢占。

**装饰音轨生成要求**：
- 每条音轨输出为**独立的单乐器演奏**，无和声填充、无伴奏、无配乐
- 音轨内有充足留白（静默时间 ≥ 30%），确保可以在游戏任意时刻平滑淡入淡出
- 所有音轨循环长度统一为 **75 秒**，与主旋律无缝对齐

---

### 4.1 雁鸭候鸟

| 字段 | 内容 |
|------|------|
| **物种名称** | 雁鸭候鸟 (Migratory Waterbird) |
| **生态功能定位** | 高频领奏层——为主旋律提供"飞翔感"的旋律线，在主旋律上方 8 度做呼应与装饰 |
| **音乐风格/流派** | Organic ambient + chamber folk |
| **BPM 范围** | 87（与主旋律同步） |
| **节奏型态** | 流畅的 3 音琶音，间插断奏扑翅感，大量留白（40% 时间静默）——进入点天然清晰 |
| **核心音阶或调式** | D major pentatonic (D, E, F♯, A, B)——五声音阶确保与主旋律和声完全兼容 |
| **情感基调** | 清晨起飞的轻盈感，长途飞行中的从容与专注，湿地上空盘旋时的水汽感 |
| **标志性音色描述** | Alto flute，中高频 250Hz–3kHz，主旋律上方 8 度，偶尔使用 flutter-tonguing 模拟翅膀振动 |
| **动态起伏设计** | 淡入时长 2.0 秒；正常循环时保持 -8dB；灭绝时 3.0 秒线性淡出 |

**【Suno / Udio 英文提示词】**

```
Instrumental only, seamless loop, no vocals, no lyrics.
Species stem layer for ecological migration game — migratory waterbird ornament track.
This is NOT a standalone song, it is a decorative layer designed to sit on top of a main theme.
Key: D major pentatonic (D, E, F#, A, B). Mode: major pentatonic.
BPM: 87. Time signature: 4/4. Loop length: 75 seconds (matching main theme).
Instrumentation: solo alto flute, breathy articulation, occasional flutter-tonguing.
No accompaniment, no chords, no bass, no percussion — just the flute line.
Texture: a single melodic line floating above the main theme, one octave higher than the main melody.
Lots of silence between phrases — the flute plays for about 60% of the loop, resting for 40%.
The silence sections are the natural "entry points" for this layer — at least three
long silences (4–8 bars each) spaced throughout the loop where no flute notes appear.
Rhythm: flowing 3-note arpeggio figures (D-F#-A, E-A-B, F#-A-D),
with occasional staccato 16th-note flutters simulating wingbeats,
placed in the gaps between main theme phrases.
Mood arc: enters quietly at 0s with a rising 3rd interval (D to F#),
floats through the midsection with sustained breathy notes,
plays a brief flutter-tongue passage at 45s as the main theme rises,
gently descends and fades by 70s to allow seamless loop.
Mixing: alto flute panned slightly left (L65), peak at -8dB relative to main theme,
high-pass filter at 200Hz to avoid low-frequency clash,
reverb: small bright room, 0.8s decay, 20% wet — intimate, close, present.
Negative prompt: no vocals, no lyrics, no drums, no bass, no guitar, no piano,
no chords, no harmony, no accompaniment, no standalone song feel,
no dense arrangement, no reverb-drenched ambient, no cinematic strings,
no battle music, no EDM, no distorted anything, no synth pad, no lo-fi.
```

**中文解释**：雁鸭候鸟装饰音轨——中音长笛独奏，呼吸感吹奏，偶尔弹舌（flutter-tonguing）模拟翅膀振动。D 大调五声音阶，87 BPM，75 秒循环。旋律线漂浮在主旋律上方 8 度，约 40% 时间静默。循环中有至少三处 4–8 小节的长静默段，是音轨最佳卡点。混音偏左，峰值比主旋律低 8dB，高通滤波 200Hz，小房间混响 0.8 秒。

---

### 4.2 帝王蝶

| 字段 | 内容 |
|------|------|
| **物种名称** | 帝王蝶 (Monarch Butterfly) |
| **生态功能定位** | 极高频闪光层——在主旋律的乐句间隙插入极短的高频点状音，像蝴蝶翅膀在花蜜地中反光的听觉化表现 |
| **音乐风格/流派** | Minimalist game music + pointillistic ambient |
| **BPM 范围** | 87（与主旋律同步） |
| **节奏型态** | 反拍单音闪烁，每个音之间间隔不均匀（2–5 拍）——大量空白段，任意时刻淡入都不会打断正在演奏的音符 |
| **核心音阶或调式** | D major Lydian (D, E, F♯, G♯, A, B, C♯)——与主旋律完全同调 |
| **情感基调** | 脆弱而执着的闪烁感，随时可能被风吹散的易碎美 |
| **标志性音色描述** | Glockenspiel，极高频 2kHz–8kHz，硬槌击奏，每个音 0.2–0.4 秒，音量极轻（-12dB），无延音踏板 |
| **动态起伏设计** | 淡入时长 1.5 秒；正常循环时以 -12dB 间歇出现；灭绝时 2.5 秒内闪烁频率递减至停止 |

**【Suno / Udio 英文提示词】**

```
Instrumental only, seamless loop, no vocals, no lyrics.
Species stem layer for ecological migration game — monarch butterfly ornament track.
This is NOT a standalone song, it is a decorative layer of pointillistic high-frequency sparkles.
Key: D major Lydian (D, E, F#, G#, A, B, C#).
BPM: 87. Time signature: 4/4. Loop length: 75 seconds (matching main theme).
Instrumentation: solo glockenspiel, hard mallet, no sustain, no other instruments.
Texture: pointillistic — individual bright high-frequency notes appearing in isolation,
like drops of light scattered across the main theme's gaps.
Each note is 0.2-0.4 seconds long, with sharp attack and immediate decay.
Silence between notes ranges from 2 to 5 beats, irregular, simulating butterfly flight path.
The long silences (3+ beats) are natural entry points for this layer —
the track can be faded in at any of these silence windows without disrupting the music.
Rhythm: offbeat placement — notes never land on beat 1,
they appear on the "and" of beats 2, 3, and 4, and occasionally on beat 4 itself.
Total notes in the 75-second loop: approximately 18-24, never more.
Mood arc: first appearance at 8s (two notes), gradually increasing frequency through midsection,
peak density at 35-45s (one note every 2 beats),
thinning out after 55s, last note at 70s before loop point.
Mixing: glockenspiel panned hard right (R75), peak at -12dB relative to main theme,
high-pass filter at 2kHz, no reverb (dry, present, crystalline).
Negative prompt: no vocals, no lyrics, no drums, no bass, no guitar, no strings, no piano,
no chords, no melody, no sustained notes, no glissando, no trill, no arpeggio,
no ambient pad, no reverb wash, no echo, no delay, no phaser,
no standalone song, no dense arrangement, no cinematic, no EDM, no lo-fi.
```

**中文解释**：帝王蝶装饰音轨——钟琴独奏，硬槌击奏，无延音。点彩派织体，每个音 0.2–0.4 秒，尖锐攻击和立即衰减。音符间隔不规则（2–5 拍），75 秒内约 18–24 个音符，大量空白窗口可随时淡入。混音极右，峰值比主旋律低 12dB，高通 2kHz，无混响（干、晶亮、直接）。

---

### 4.3 斑头雁

| 字段 | 内容 |
|------|------|
| **物种名称** | 斑头雁 (Bar-headed Goose) |
| **生态功能定位** | 极高空穿透层——在主旋律最高音区之上叠加极短的高音鸣叫，像从极高海拔穿透云层传来的雁鸣 |
| **音乐风格/流派** | Minimalist ambient + alpine world fusion |
| **BPM 范围** | 87（与主旋律同步） |
| **节奏型态** | 极稀疏的 2–3 音鸣叫组合，每次出现持续 1.5–2.0 秒，间隔 8–12 小节——绝大多数时间为静默，极易卡点 |
| **核心音阶或调式** | D major pentatonic high register (D5, E5, F♯5, A5, B5) |
| **情感基调** | 高空稀薄空气中的辽远与孤独，从极远处传来的生命力信号 |
| **标志性音色描述** | Piccolo，极高频 3kHz–7kHz，短促吹奏（每个音 0.3–0.5 秒），带有轻微 breath noise，长混响模拟高空回声 |
| **动态起伏设计** | 淡入时长 1.2 秒；正常循环时每 8–12 小节出现一组 2–3 音鸣叫；灭绝时最后一组鸣叫尾音延长 2 秒后停止 |

**【Suno / Udio 英文提示词】**

```
Instrumental only, seamless loop, no vocals, no lyrics.
Species stem layer for ecological migration game — bar-headed goose ornament track.
This is NOT a standalone song, it is a decorative layer of extremely high-altitude calls.
Key: D major pentatonic, high register (D5-E5-F#5-A5-B5).
BPM: 87. Time signature: 4/4. Loop length: 75 seconds (matching main theme).
Instrumentation: solo piccolo, short breathy articulation, no other instruments.
Texture: extremely sparse — the piccolo plays only 3-4 brief call phrases
in the entire 75-second loop, each phrase lasting 1.5-2.0 seconds,
consisting of 2-3 ascending notes (e.g., D5-F#5-A5 or E5-A5-B5).
Between phrases: complete silence from this layer (8-12 bars of nothing).
The long silences between calls make this track easy to fade in at any moment —
simply wait for the current phrase to end, then fade in during the silence.
Rhythm: calls appear at approximately bar 6, bar 18, bar 38, and bar 60 — irregular spacing
simulating the vast distance and thin air of high-altitude flight.
Each call has a slight ascending glissando between notes, like a bird cry.
Mood arc: the calls are distant, piercing but quiet, carrying across enormous space.
The silence between calls is as important as the calls themselves.
Mixing: piccolo centered, peak at -11dB relative to main theme,
high-pass filter at 2.5kHz,
reverb: large canyon/alpine space, 3.5s decay, 45% wet —
the only species layer with heavy reverb, creating the "echo from the peaks" effect.
Negative prompt: no vocals, no lyrics, no drums, no bass, no guitar, no piano,
no chords, no sustained melody, no accompaniment, no strings, no pad,
no dense arrangement, no continuous playing, no trill, no virtuosic passage,
no battle music, no EDM, no synth, no lo-fi, no distorted anything.
```

**中文解释**：斑头雁装饰音轨——短笛独奏，短促吹奏带气声。极端稀疏——75 秒循环内只出现 3–4 次鸣叫，每次 1.5–2.0 秒，由 2–3 个上行音符组成。乐句之间有 8–12 小节的长静默，是最易卡点的音轨之一。混音正中，峰值比主旋律低 11dB，高通 2.5kHz，峡谷/高山空间混响 3.5 秒。

---

### 4.4 鲑鱼

| 字段 | 内容 |
|------|------|
| **物种名称** | 鲑鱼 (Salmon) |
| **生态功能定位** | 低频根音镜像层——在主旋律下方 8 度演奏其低音镜像，为整体音乐提供"水深处的重量" |
| **音乐风格/流派** | Aquatic ambient + minimalist cello music |
| **BPM 范围** | 87（与主旋律同步），half-time feel 43.5 |
| **节奏型态** | 缓慢 2 拍脉动，长弓持续音与拨弦交替，弓弦段本身是天然的进入/退出窗口 |
| **核心音阶或调式** | D natural minor (D, E, F, G, A, Bb, C) 借用平行小调，根音始终回到 D，与主旋律的 D 大调兼容 |
| **情感基调** | 逆流而上的沉默力量，水下深处的暗色涌动 |
| **标志性音色描述** | Cello solo，低频 80–400Hz，长弓拉弦与拨弦交替，低通滤波 800Hz 使音色更暗 |
| **动态起伏设计** | 淡入时长 2.5 秒；正常循环时保持 -7dB；灭绝时长弓持续音中断，1.5 秒后残余泛音淡出 |

**【Suno / Udio 英文提示词】**

```
Instrumental only, seamless loop, no vocals, no lyrics.
Species stem layer for ecological migration game — salmon ornament track.
This is NOT a standalone song, it is a decorative layer designed to sit BELOW the main theme.
Key: D natural minor (D, E, F, G, A, Bb, C) — borrowed from parallel minor,
root note always returns to D, compatible with main theme's D major.
BPM: 87, half-time feel. Time signature: 4/4. Loop length: 75 seconds (matching main theme).
Instrumentation: solo cello, alternating between arco (bowed) long sustained notes
and pizzicato (plucked) quarter notes.
Texture: deep, submerged, dark — the cello plays one octave below the main melody,
providing a low-frequency mirror image, like a reflection in deep water.
The arco notes are sustained for 2-3 bars each, creating a slow pulse.
The pizzicato notes appear in pairs on beats 2 and 4, like a heartbeat underwater.
Natural fade points exist at the boundaries between arco and pizzicato sections (every 6-8 bars),
making this layer easy to fade in or out without audible interruption.
Rhythm: slow 2-beat pulse — arco sustain on beats 1-2, pizzicato on beats 3-4.
The pulse should feel like swimming against a current: steady, effortful, never rushing.
Mood arc: enters at 5s with a low D2 sustained note (arco),
pizzicato pattern begins at 12s,
midsection (30-50s) has more active pizzicato suggesting upstream struggle,
final section (60-75s) returns to long sustained arco notes, fading to loop point.
Mixing: cello panned slightly left (L60), peak at -7dB relative to main theme,
low-pass filter at 800Hz to darken the timbre and simulate underwater absorption,
reverb: medium stone room, 1.5s decay, 25% wet.
Negative prompt: no vocals, no lyrics, no drums, no bass guitar, no synth bass,
no guitar, no piano, no flute, no woodwinds, no bright timbre,
no fast tempo, no aggressive attack, no slap bass, no funky groove,
no chords, no harmony layer, no ambient pad, no standalone song,
no battle music, no EDM, no distorted cello, no lo-fi, no horror drone.
```

**中文解释**：鲑鱼装饰音轨——大提琴独奏，长弓拉弦与拨弦交替。D 自然小调，根音始终回到 D，兼容主旋律。在主旋律下方 8 度演奏低音镜像。弓弦段与拨弦段之间（每 6–8 小节）有天然的过渡窗口，可在此处淡入淡出。混音偏左，峰值比主旋律低 7dB，低通滤波 800Hz，石头房间混响 1.5 秒。

---

### 4.5 角马兽群

| 字段 | 内容 |
|------|------|
| **物种名称** | 角马兽群 (Wildebeest Herd) |
| **生态功能定位** | 中频重量填充层——用持续中频长音为整体音乐提供"大地重量感"，替代鼓点的功能但不使用鼓 |
| **音乐风格/流派** | Soft tribal pulse + minimalist drone folk |
| **BPM 范围** | 87（与主旋律同步），half-time feel（每 2 拍一个长音脉动） |
| **节奏型态** | 缓慢 2 拍脉动，每 2 小节一个长弓持续音，长弓段开头是最佳淡入点 |
| **核心音阶或调式** | D major with emphasis on IV (G) and V (A)——强调下属和属音，为主旋律提供和声根基 |
| **情感基调** | 缓慢、笨重但不可阻挡的集体行进，草原上数百个身体同步移动的重量与温暖 |
| **标志性音色描述** | Viola，中频 150–800Hz，长弓持续音，偶尔拨弦，轻微 chorus 效果增加"群感" |
| **动态起伏设计** | 淡入时长 2.0 秒；正常循环时保持 -8dB；灭绝时长弓持续音逐渐变弱变细，4 秒淡出 |

**【Suno / Udio 英文提示词】**

```
Instrumental only, seamless loop, no vocals, no lyrics.
Species stem layer for ecological migration game — wildebeest herd ornament track.
This is NOT a standalone song, it is a decorative layer providing mid-frequency weight.
Key: D major, emphasizing G (IV) and A (V) as sustained pedal notes.
BPM: 87, half-time feel (one pulse every 2 beats). Time signature: 4/4. Loop length: 75 seconds.
Instrumentation: solo viola, long bow sustained notes, occasional pizzicato.
No drums, no hand percussion — the "weight" comes from the bow pressure.
Texture: thick, warm, grounded — the viola sustains long notes (2 bars each)
in the mid-frequency range, creating a sense of earth-bound mass.
Occasional pizzicato notes (2 per phrase) add a "footstep" quality without becoming a beat.
A very subtle chorus effect (rate 0.3Hz, depth 5%) makes the single viola sound
like a small section, giving "herd" quality to the sound.
Each new sustained note (every 2 bars) marks a natural fade-in point for this layer —
fade in at the start of any new bow stroke and it will sound intentional.
Rhythm: slow 2-beat pulse — sustain on bars 1-2 (G note), sustain on bars 3-4 (A note),
pizzicato on beat 1 of bars 5 and 7, then repeat with slight pitch variation.
Mood arc: enters at 10s with a low G3 sustained note,
builds very gradually through the midsection with increasing bow pressure,
peak weight at 40-50s where pizzicato is most active,
gradually relaxes bow pressure after 60s, fading to loop point.
Mixing: viola panned slightly right (R55), peak at -8dB relative to main theme,
subtle chorus effect (0.3Hz, 5% depth),
gentle low-pass at 1.2kHz to keep the timbre warm and rounded,
reverb: warm wood room, 1.2s decay, 20% wet.
Negative prompt: no vocals, no lyrics, no drums, no hand percussion, no frame drum,
no djembe, no bongos, no tribal drums, no guitar, no piano, no flute,
no bright timbre, no fast tempo, no aggressive attack, no slap,
no funk groove, no dance beat, no EDM, no synth, no pad,
no standalone song, no battle music, no chase music, no horror, no lo-fi.
```

**中文解释**：角马兽群装饰音轨——中提琴独奏，长弓持续音加偶尔拨弦。D 大调，强调 G（IV）和 A（V）。每 2 小节的新弓弦起点就是最佳淡入点。轻微 chorus 效果让独奏听起来像小群组（"兽群感"）。无任何鼓类——重量来自弓压。混音偏右，峰值比主旋律低 8dB，木质房间混响 1.2 秒。

---

### 4.6 美洲鳗

| 字段 | 内容 |
|------|------|
| **物种名称** | 美洲鳗 (American Eel) |
| **生态功能定位** | 暗色连接层——用低音单簧管的滑音在主旋律的乐句之间做"水下过渡"，填补和声间隙 |
| **音乐风格/流派** | Aquatic ambient + dark jazz minimalism |
| **BPM 范围** | 87（与主旋律同步） |
| **节奏型态** | 缓慢滑音弧线，每次滑音后有 2–3 拍的呼吸停顿——"游-停-游"的自然卡点节奏 |
| **核心音阶或调式** | D Dorian (D, E, F, G, A, B, C)——多利亚调式，暗色但不绝望，与主旋律 D 大调兼容 |
| **情感基调** | 水下暗色潜行的神秘与从容，夜行性生物的冷静 |
| **标志性音色描述** | Bass clarinet，低中频 120Hz–1.5kHz，滑音连接音符，低通滤波 1.2kHz |
| **动态起伏设计** | 淡入时长 2.5 秒；正常循环时保持 -9dB；灭绝时最后一个滑音"断裂"，2 秒淡出 |

**【Suno / Udio 英文提示词】**

```
Instrumental only, seamless loop, no vocals, no lyrics.
Species stem layer for ecological migration game — American eel ornament track.
This is NOT a standalone song, it is a decorative layer of dark, serpentine connecting lines.
Key: D Dorian (D, E, F, G, A, B, C) — dark but not hopeless, compatible with main theme D major.
BPM: 87. Time signature: 4/4. Loop length: 75 seconds (matching main theme).
Instrumentation: solo bass clarinet, low register, using portamento/glissando between notes.
No other instruments, no accompaniment.
Texture: dark, smooth, serpentine — the bass clarinet plays slow gliding lines
that connect the harmonic gaps in the main theme.
Each phrase is a single smooth glissando curve covering a 4th or 5th interval
(e.g., D2 to G2, or A2 to D3), lasting 3-4 seconds, followed by 2-3 beats of silence.
The breathing pause (2-3 beats of silence) after each glissando is the ideal fade-in point
for this layer — enter during any silence and the next glissando will feel natural.
Rhythm: irregular — phrases appear at bars 4, 12, 22, 34, 48, 62,
with varying silence between them (2-5 beats).
Mood arc: enters quietly at 4s with a low D2 glissando up to G2,
continues with alternating ascending and descending glides through the midsection,
the glides get slightly longer and more expansive at 34-48s,
then contracts back to smaller intervals by 62s, fading to loop point.
Mixing: bass clarinet panned slightly right (R60), peak at -9dB relative to main theme,
low-pass filter at 1.2kHz to maintain dark timbre,
reverb: medium wet cave/underwater space, 2.0s decay, 30% wet.
Negative prompt: no vocals, no lyrics, no drums, no bass guitar, no synth bass,
no guitar, no piano, no flute, no bright timbre, no high register,
no fast tempo, no jazz walking bass, no swing, no funk,
no aggressive attack, no slap, no staccato, no chords, no harmony,
no ambient pad, no standalone song, no battle music, no EDM, no horror, no lo-fi.
```

**中文解释**：美洲鳗装饰音轨——低音单簧管独奏，低音区，使用滑音连接音符。D 多利亚调式。每次滑音后有 2–3 拍呼吸停顿，停顿就是最佳淡入点。滑音出现时间不规则（第 4、12、22、34、48、62 小节）。混音偏右，峰值比主旋律低 9dB，低通 1.2kHz，洞穴/水下混响 2.0 秒。

---

### 4.7 绿海龟

| 字段 | 内容 |
|------|------|
| **物种名称** | 绿海龟 (Green Sea Turtle) |
| **生态功能定位** | 稀有高频点缀层——每隔 4 小节出现一组冷冽的高音点，像海龟在广阔海面上偶尔浮出水面呼吸 |
| **音乐风格/流派** | Aquatic ambient + minimalist pointillism |
| **BPM 范围** | 87（与主旋律同步） |
| **节奏型态** | 每 4 小节出现一次 2 音短句，规律但稀疏——每次 2 音结束后有整整 3 小节的静默 |
| **核心音阶或调式** | D major pentatonic high register (D5, E5, F♯5, A5, B5) |
| **情感基调** | 古老、缓慢、从容不迫的海洋生命，一种"存在了上亿年"的沉静 |
| **标志性音色描述** | Celesta，高频 2kHz–6kHz，每个音 0.5–0.8 秒，有金属共振尾音，音量极轻（-12dB） |
| **动态起伏设计** | 淡入时长 1.5 秒；正常循环时每 4 小节出现一组 2 音短句，保持 -12dB；灭绝时最后一个音的尾音延长 3 秒后消散 |

**【Suno / Udio 英文提示词】**

```
Instrumental only, seamless loop, no vocals, no lyrics.
Species stem layer for ecological migration game — green sea turtle ornament track.
This is NOT a standalone song, it is a decorative layer of rare, ancient high-frequency points.
Key: D major pentatonic, high register (D5, E5, F#5, A5, B5).
BPM: 87. Time signature: 4/4. Loop length: 75 seconds (matching main theme).
Instrumentation: solo celesta, no other instruments.
Texture: extremely sparse, ancient, calm — the celesta plays only 2-note phrases
ascending by a 3rd (e.g., D5 to F#5, or A5 to B5), once every 4 bars,
each note lasting 0.5-0.8 seconds.
After each 2-note phrase: 3 full bars of complete silence from this layer.
These 3-bar silences are the ideal fade-in windows — the track can be entered
at any silence and the next phrase will arrive naturally on the 4-bar cycle.
Rhythm: 2-note phrases at bars 4, 8, 12, 16, 20, 24, 28, 32...
— regular 4-bar spacing creating a slow, inevitable cycle.
Each phrase: note 1 on beat 1, note 2 on beat 2, silence on beats 3-4 and the next 3 bars.
Mood arc: the phrases are identical in character throughout — no "build", no "climax",
just patient, ancient repetition. The emotional quality is timelessness.
At bars 36-40, the phrases shift up by one scale degree (F#5-A5, B5-D5) for variation,
then return to the original register.
Mixing: celesta panned slightly left (L65), peak at -12dB relative to main theme,
high-pass filter at 2kHz, no additional reverb (celesta's natural resonance is sufficient),
slight stereo widening to make it feel "out in the ocean".
Negative prompt: no vocals, no lyrics, no drums, no bass, no guitar, no strings, no piano,
no flute, no woodwinds, no chords, no melody, no sustained notes,
no glissando, no trill, no arpeggio, no fast passage, no dense arrangement,
no ambient pad, no reverb wash, no echo, no delay,
no standalone song, no cinematic, no EDM, no battle music, no lo-fi, no synth lead.
```

**中文解释**：绿海龟装饰音轨——钢片琴独奏。极端稀疏——每 4 小节出现一次 2 音上行 3 度短句，之后有整整 3 小节静默。每次静默都是最佳淡入窗口。乐句在第 4、8、12...小节规律出现。无"高潮"，只有耐心古老的重复。混音偏左，峰值比主旋律低 12dB，高通 2kHz，无附加混响。

---

### 4.8 林蛙

| 字段 | 内容 |
|------|------|
| **物种名称** | 林蛙 (Wood Frog) |
| **生态功能定位** | 微观颗粒节奏层——在主旋律的低音区与中音区之间插入极短促的湿润颗粒音，像林蛙在湿地落叶中短距离跳跃 |
| **音乐风格/流派** | Organic ambient + folk minimalism |
| **BPM 范围** | 87（与主旋律同步） |
| **节奏型态** | 不规则短跳，每个音 0.1–0.2 秒，以 2–4 个音为一组，组间间隔 3–6 拍——组间停顿是最佳卡点 |
| **核心音阶或调式** | D major pentatonic mid register (D4, E4, F♯4, A4, B4)——五声音阶中音区，与其他物种频段错开 |
| **情感基调** | 微小但顽强的生命力，湿润林地中的脆弱跳动 |
| **标志性音色描述** | Kalimba（拇指琴），中频 300Hz–3kHz，极短拨奏（每个音 0.1–0.2 秒），带有金属簧片共振和轻微"湿润"质感 |
| **动态起伏设计** | 淡入时长 1.5 秒；正常循环时以 2–4 音为一组间歇出现，保持 -10dB；灭绝时最后一个音组逐渐变慢、变弱，3 秒淡出 |

**【Suno / Udio 英文提示词】**

```
Instrumental only, seamless loop, no vocals, no lyrics.
Species stem layer for ecological migration game — wood frog ornament track.
This is NOT a standalone song, it is a decorative layer of tiny, wet, granular hops.
Key: D major pentatonic, mid register (D4, E4, F#4, A4, B4).
BPM: 87. Time signature: 4/4. Loop length: 75 seconds (matching main theme).
Instrumentation: solo kalimba (thumb piano), short plucks, no other instruments.
Texture: micro-granular, organic, wet — the kalimba plays groups of 2-4 very short notes
(each note 0.1-0.2 seconds), with the characteristic metallic tine resonance of a kalimba.
The notes within each group are separated by 8th-note gaps, creating a "hop-hop-hop" feel.
Between groups: silence of 3-6 beats, irregular — these silences are the ideal fade-in points.
The track can be faded in during any silence window and the next hop group will feel natural.
The kalimba should sound slightly "wet" — as if recorded in a humid forest environment.
Rhythm: groups appear at approximately bars 3, 7, 12, 18, 25, 33, 42, 50, 58, 66 —
irregular spacing, more frequent in the midsection (bars 25-50), sparser at start and end.
Each group pattern: 2 notes ascending (D4-F#4), or 3 notes (E4-A4-B4),
or 4 notes climbing (D4-E4-F#4-A4), chosen within pentatonic scale.
Mood arc: the notes are small, intimate, vulnerable — ground level, from among wet leaves.
No grand arc, just the persistent presence of tiny life.
Mixing: kalimba centered, peak at -10dB relative to main theme,
no high-pass filter (the body resonance at 300Hz is part of the character),
gentle low-pass at 4kHz to soften the metallic edge,
reverb: tiny wooden room, 0.5s decay, 15% wet — very close, very present.
Negative prompt: no vocals, no lyrics, no drums, no bass, no guitar, no piano, no strings,
no flute, no woodwinds, no chords, no sustained notes, no glissando, no trill,
no melody line, no arpeggio, no dense arrangement, no ambient pad,
no reverb wash, no echo, no delay, no standalone song,
no battle music, no EDM, no cinematic, no lo-fi, no synth, no percussion.
```

**中文解释**：林蛙装饰音轨——卡林巴琴独奏，极短拨奏。微颗粒织体，以 2–4 个极短音为一组，组间不规则间隔 3–6 拍，停顿是最佳淡入点。中段（25–50 小节）较密集，首尾较稀疏。混音正中，峰值比主旋律低 10dB，低通 4kHz，极小木质房间混响 0.5 秒。

---

### 4.9 物种音轨动态规则汇总

| 事件 | 触发条件 | 音轨行为 | 时长 |
|------|---------|---------|------|
| **物种解锁** | `gameStore.tryUnlockSpeciesForStage` 成功 | 对应物种 stem 从 -∞ 淡入到目标音量，在音轨的下一个静默/呼吸窗口处触发 | 1.2–2.5 秒（按物种设定） |
| **成功迁徙** | 物种完成一次迁徙任务 | 对应 stem 音量短暂提升 2–3dB + 演奏密度感觉上增加 | 2–4 秒后回落 |
| **物种灭绝** | `extinctSpeciesIds` 新增该物种 | 对应 stem 逐渐淡出并停止播放 | 2.5–4.0 秒（按物种设定） |

---

## 五、音效设计提示词

> 本章包含两类音效：
> - **5.1 通用交互音效（3 个）**：空灵风格，用于所有物种的连线交互
> - **5.2 物种专属声音（8 个）**：物种叫声或相关环境音，鼠标拖动哪个物种出发就播放那个物种的声音

---

### 5.1 通用交互音效（三个）

这三个音效贯穿整个游戏，不区分物种，风格统一为**空灵（ethereal）**：轻盈、透明、带有自然气息，像是在生态网络中"拨动能量"的感觉。

---

#### 5.1a 鼠标拖动物种出发

> **触发时机**：玩家按下鼠标并拖动物种，开始绘制迁徙路线的瞬间

| 字段 | 内容 |
|------|------|
| **拟音参考** | 一根无形的丝线被轻轻拉出——玻璃弦拨动、气流在细管中穿行、晶莹水滴从水面弹起的上升感 |
| **时长** | 0.25–0.35 秒 |
| **频率范围** | 1kHz–8kHz 为主，峰值在 2.5–4kHz；无低频成分 |
| **空间混响** | 极小房间，预延迟 3ms，衰减 0.25 秒，湿声 12%——清脆、近、不拖尾 |
| **瞬态强度** | 软中等——起音 5ms（有触感但不尖锐），0.3 秒内衰减至 -50dB |
| **情绪定位** | "开始"的轻盈感：好奇、轻轻触碰、期待 |

**【英文提示词】**

```
Sound effect, single shot, 0.30 seconds, ethereal style.
Trigger: player clicks and drags an animal to begin drawing a migration route.
Sound concept: an invisible silk thread being gently pulled out —
a delicate, airy, ascending energy.
Character: crystalline, weightless, organic, not magical or sci-fi.
Layer 1: soft glass string pluck — a single high-frequency tone (2.5-4kHz)
with sharp attack (5ms) and smooth decay (200ms). Like a glass harp string touched lightly.
Layer 2: thin air breath — a very faint ascending airflow sound from 1kHz to 6kHz,
lasting 0.25 seconds, like wind slipping through a narrow crack.
Layer 3 (optional, very subtle): a single water droplet tone at 5-7kHz,
lasting 0.1 seconds, like a bead of water lifted off a still surface.
The three layers overlap and blend into a single "airy pluck" sensation.
Frequency range: 1kHz-8kHz, no content below 800Hz, peak at 2.5-4kHz.
Transient: soft-medium attack (5ms), fast decay (total duration 0.30s).
Reverb: tiny near-field space, 3ms pre-delay, 0.25s decay, 12% wet — crisp, close, no tail.
The sound should feel: light, precise, inviting — like touching a soap bubble without breaking it.
Negative prompt: no magic spell blast, no laser, no sci-fi zap, no weapon sound,
no deep bass, no long reverb tail, no choir, no vocals, no drum, no bass,
no digital harshness, no clipping, no lo-fi crackle, no distortion.
```

**中文解释**：拖动物种出发音效——0.30 秒，1kHz–8kHz，空灵风格。三层叠加：柔软的玻璃弦拨音（2.5–4kHz）、细气流上行（1–6kHz）、可选的单一水滴高频音（5–7kHz）。起音 5ms（有触感但不尖锐），整体在 0.30 秒内衰减。极小近场混响 0.25 秒，12% 湿声。感觉像轻轻触碰一个肥皂泡。

---

#### 5.1b 连线经过节点

> **触发时机**：路线经过/吸附到地图上的生态节点

| 字段 | 内容 |
|------|------|
| **拟音参考** | 两个生态节点之间"接通"的感觉——轻叩木头的共鸣声、远处铃音的余震、一滴水落入平静水面后的涟漪 |
| **时长** | 0.15–0.20 秒 |
| **频率范围** | 500Hz–5kHz；木叩在 500Hz–1.5kHz，铃音在 2–4kHz |
| **空间混响** | 小房间，预延迟 5ms，衰减 0.3 秒，湿声 15% |
| **瞬态强度** | 中等——木叩为硬起音（2ms），铃音为软起音（8ms）；整体在 0.18 秒内衰减至 -40dB |
| **情绪定位** | "连接"的满足感：轻盈、确认、温柔的节点反馈，可重复听不烦 |

**【英文提示词】**

```
Sound effect, single shot, 0.18 seconds, ethereal style.
Trigger: migration route passes through or snaps to an ecological node on the map.
Sound concept: two ecological nodes connecting — a gentle, crystalline "touch" acknowledgment.
Character: light, clear, pleasant, repeatable without fatigue.
Layer 1: soft wood tap — a single muffled knock at 500Hz-1.5kHz,
hard attack (2ms), fast decay (100ms). Like tapping the edge of a wooden bowl.
Layer 2: soft chime resonance — a brief bell overtone at 2-4kHz,
soft attack (8ms), decay to silence by 180ms. Like a tiny bell touched lightly.
The wood tap provides the "snap" sensation, the chime provides the "warmth" reward.
Total duration: 0.18 seconds from first attack to -50dB silence.
Frequency range: 500Hz-5kHz, no content below 400Hz or above 6kHz.
Reverb: small room, 5ms pre-delay, 0.30s decay, 15% wet.
The sound must be comfortable to hear 20+ times in a single play session without annoyance.
No pitch variation needed — this is a consistent universal feedback sound.
Negative prompt: no deep bass, no harsh beep, no error sound, no buzzer,
no synth ping, no digital click artifact, no reverb wash, no long tail,
no vocals, no choir, no clipping, no distortion, no lo-fi.
```

**中文解释**：连线经过节点音效——0.18 秒，500Hz–5kHz，空灵风格。两层叠加：木叩点击感（500Hz–1.5kHz，硬起音 2ms）+ 铃音共鸣（2–4kHz，软起音 8ms）。木叩提供"吸附确认"，铃音提供"奖励温暖感"。必须在单局游戏中重复 20+ 次而不令人烦躁。小房间混响 0.3 秒，15% 湿声。

---

#### 5.1c 连接到终点结束

> **触发时机**：玩家松开鼠标，路线完成，迁徙任务开始

| 字段 | 内容 |
|------|------|
| **拟音参考** | 路线被生态网络接纳的收束感——轻柔的"呼气"低频暖音 + 高频晶体粒子漂散 + 中频弦乐上升小滑音 |
| **时长** | 0.70–0.90 秒 |
| **频率范围** | 200Hz–8kHz；低频暖感 200–500Hz，中频上升感 500Hz–3kHz，高频粒子 3–8kHz |
| **空间混响** | 中厅混响，预延迟 12ms，衰减 1.0 秒，湿声 20%——比上面两个音效更"开阔" |
| **瞬态强度** | 整体柔软——低频暖音软起音（15ms），中频弦乐渐入（40ms），高频粒子点状（5ms 起音，80ms 衰减） |
| **情绪定位** | "完成"的满足感：有机收束、温柔放开、路线被自然接受 |

**【英文提示词】**

```
Sound effect, single shot, 0.80 seconds, ethereal style.
Trigger: player releases mouse, migration route is complete, migration task begins.
Sound concept: the route being accepted into the ecological network —
a gentle, organic "settling into place" feeling.
Character: conclusive but soft, warm, natural — not a victory fanfare, not a game completion jingle.
Layer 1 (0-0.4s): low-frequency warm breath at 200-500Hz —
a soft sine-wave swell, attack 15ms, decaying smoothly to nothing by 0.4s.
Like a quiet exhale, or the feeling of something gently settling.
Layer 2 (0.05-0.55s): mid-frequency ascending micro-glide at 500Hz-3kHz —
a brief warm string or singing bowl tone that rises by a minor 3rd over 0.4 seconds
then fades. Provides the "lift" and "completion" sensation.
Soft attack (40ms fade-in), decaying by 0.55s.
Layer 3 (0.2-0.8s): high-frequency crystalline particle scatter at 3-8kHz —
3-5 tiny glass-bead tones appearing gently between 0.2s and 0.7s,
each 0.05-0.1 seconds, random pitch within D major pentatonic.
Like fine mist catching light, or seeds dispersing in wind.
Frequency range: 200Hz-8kHz, no extreme bass, no harsh highs.
Reverb: medium hall, 12ms pre-delay, 1.0s decay, 20% wet —
slightly more open than the other two interaction sounds.
The sound should feel: complete, natural, peaceful — like releasing a bird.
The string glide tail should blend smoothly back into the main theme's harmony (D major).
Negative prompt: no victory fanfare, no orchestral hit, no brass stab,
no timpani, no explosion, no power-up jingle, no arcade completion sound,
no deep bass drop, no heavy choir, no battle drums, no cinematic trailer hit,
no clipping, no distortion, no lo-fi, no synth lead.
```

**中文解释**：连接到终点结束音效——0.80 秒，200Hz–8kHz，空灵风格。三层叠加：低频温柔呼气感（200–500Hz，软起音像轻轻呼气）、中频上升小滑音（500Hz–3kHz，像弦乐或颂钵上升小三度）、高频晶体粒子（3–8kHz，3–5 个微小玻璃珠音）。中厅混响 1.0 秒，20% 湿声，比前两个音效更开阔。弦乐滑音尾音与主旋律 D 大调和声融合。不是胜利喇叭，是"释放小鸟"的感觉。

---

### 5.2 物种专属声音（八个）

**设计原则**：
- **时长**：短，1–2 声即可，0.5–2.5 秒
- **触发逻辑**：玩家拖动哪个物种出发，就在出发瞬间播放该物种的声音（与 5.1a 通用音效**叠加**或**替换**，设计者可选）
- **有叫声的物种**：录制/生成真实或拟真的叫声 1–2 声
- **无叫声的物种**：制作与该物种最相关的环境特征音（0.5–2 秒），带有该物种活动场景的听觉印象

---

#### 5.2a 雁鸭候鸟叫声

| 字段 | 内容 |
|------|------|
| **声音类型** | 有叫声——水鸟鸣叫 |
| **声音描述** | 清脆的水鸭/雁类鸣叫，1–2 声，短促，带有湿地空气感 |
| **时长** | 0.6–1.2 秒 |
| **音调** | 中高音，清脆，带有轻微气流感 |
| **环境混响** | 湿地开阔空间，预延迟 15ms，衰减 0.5 秒，湿声 18% |

**【英文提示词】**

```
Wildlife sound effect, single shot, 1.0 seconds.
Subject: migratory waterbird — duck or goose species — 1-2 short calls.
Sound: 1-2 crisp waterbird calls, the kind heard over a wetland at dawn.
The calls should sound natural and organic — duck-like or goose-like short vocalizations,
medium-high pitch, each call 0.2-0.4 seconds, with a brief pause between if 2 calls.
The calls feel light, alert, slightly distant — heard from a few meters away in open air.
Ambient: light wetland air ambience under the call — a hint of wind and open sky.
No reverb tail longer than 0.5 seconds.
Frequency range: 800Hz-5kHz (typical waterbird call range).
Total duration: 0.8-1.2 seconds including brief ambient tail.
Negative prompt: no human voice, no music, no distortion, no echo wash,
no jungle sounds, no tropical birds, no percussion, no dramatic effect,
no cartoon bird sound, no exaggerated pitch, no screech.
```

**中文解释**：雁鸭候鸟叫声——1–2 声水鸟鸣叫，清脆，中高音，湿地黎明的感觉。每声 0.2–0.4 秒，距离感像几米外。带轻微湿地空气感，无长混响尾。总长约 0.8–1.2 秒。

---

#### 5.2b 帝王蝶声音

| 字段 | 内容 |
|------|------|
| **声音类型** | 无叫声——环境特征音：数百万只帝王蝶在冷杉林停歇时，翅膀振动形成的集体低频嗡鸣 |
| **声音描述** | 数百万翅膀轻振产生的柔和集体嗡鸣，混合轻微树枝微动的沙沙声，持续 1.5 秒 |
| **时长** | 1.0–1.5 秒 |
| **音调** | 低中频嗡鸣，200–1500Hz，柔和而密集 |
| **环境混响** | 林地半开放空间，预延迟 10ms，衰减 0.6 秒，湿声 15% |

**【英文提示词】**

```
Wildlife ambient sound effect, single shot, 1.2 seconds.
Subject: monarch butterfly — not a single insect call, but the collective wing-hum
of millions of monarchs clustering in an oyamel fir forest during winter roost.
Sound: a soft, dense collective wing-vibration hum — the sound you would hear
if you stood beneath a tree covered in millions of resting butterfly wings.
Character: warm, fuzzy, continuous texture, like a low gentle drone of living wings.
Frequency range: 200Hz-1.5kHz — mid-range drone, not high-pitched buzz.
The hum should feel alive but gentle — not a swarm, not threatening, just dense and warm.
A slight rustle of fir tree branches under the weight of so many butterflies.
Fade in over 0.1s, sustain for 0.9s, fade out over 0.2s.
Ambient: light forest air under the wing-hum.
Reverb: semi-enclosed forest space, 10ms pre-delay, 0.6s decay, 15% wet.
Total duration: 1.2 seconds.
Negative prompt: no music, no single insect buzz, no bee sound, no angry swarm,
no digital drone, no sci-fi effect, no human voice, no percussion,
no cartoon insect, no cricket chirping, no mosquito-like sharp buzz.
```

**中文解释**：帝王蝶声音——不是单只蝴蝶的声音，而是数百万只帝王蝶在冷杉林集体栖息时翅膀振动产生的集体低频嗡鸣。温暖、模糊、密集的持续织体，200–1500Hz，1.2 秒。有轻微树枝沙沙感。不是蜜蜂嗡嗡声，是"生命群体的低频温暖"。

---

#### 5.2c 斑头雁叫声

| 字段 | 内容 |
|------|------|
| **声音类型** | 有叫声——高山雁类鸣叫 |
| **声音描述** | 1–2 声高亢的雁鸣，带有高山空气感，清亮而穿透，像从高空传来 |
| **时长** | 0.8–1.5 秒 |
| **音调** | 中高音，比雁鸭候鸟更高更亮，有轻微颤抖 |
| **环境混响** | 高山开阔空间，预延迟 25ms，衰减 1.2 秒，湿声 25%——比候鸟叫声混响更大，强调"高空回声" |

**【英文提示词】**

```
Wildlife sound effect, single shot, 1.2 seconds.
Subject: bar-headed goose — a high-altitude bird that flies over the Himalayas —
1-2 calls, heard from a distance high in the sky.
Sound: 1-2 high-pitched, bright goose calls — slightly higher and more piercing
than a typical lowland goose. Each call 0.3-0.5 seconds.
The call quality: clear, ringing, somewhat solitary — the sound of a bird
calling across thin, cold mountain air. A slight vibrato or natural flutter in the tone.
The calls should feel distant but present — as if heard from below while the bird flies above.
Ambient: thin mountain air ambience, cold and open.
Reverb: large alpine space, 25ms pre-delay, 1.2s decay, 25% wet —
the echo should reinforce the sense of great altitude and open sky.
Frequency range: 1kHz-6kHz (goose call range, higher register).
Total duration: 1.0-1.5 seconds including reverb tail.
Negative prompt: no human voice, no music, no tropical bird, no parrot,
no cartoon goose sound, no honk horn, no distortion, no synth effect,
no dense echo wash, no reverb longer than 2s.
```

**中文解释**：斑头雁叫声——1–2 声高亢雁鸣，比候鸟叫声更高更亮更穿透，带有轻微颤抖。有距离感，像从头顶高空传来。高山开阔混响 1.2 秒，25% 湿声，强调"高空回声"。1.0–1.5 秒。

---

#### 5.2d 鲑鱼声音

| 字段 | 内容 |
|------|------|
| **声音类型** | 无明显叫声——环境特征音：鲑鱼跳越瀑布/鱼道的水声 |
| **声音描述** | 一条大型鱼从水中用力跃出再落回的水声：前半段是沉重的"破水而出"浪涌，后半段是落水的拍击与水花散落 |
| **时长** | 1.0–2.0 秒 |
| **音调** | 低中频水声为主，80–2000Hz，瞬态明显 |
| **环境混响** | 河谷半开放空间，预延迟 20ms，衰减 0.8 秒，湿声 15% |

**【英文提示词】**

```
Wildlife foley sound effect, single shot, 1.5 seconds.
Subject: salmon leaping — a large salmon (60-80cm) launching itself out of the water
to jump a waterfall or fish ladder, then splashing back down.
Sound in two phases:
Phase 1 (0-0.6s): "bursting out of water" — a powerful low-frequency water surge
at 80-500Hz, like a large mass of water being displaced rapidly.
Hard attack (10ms), the sound of a heavy fish breaking the water surface with force.
A "whoosh" of water spray follows immediately (500Hz-2kHz, 0.2s duration).
Phase 2 (0.6-1.5s): "re-entry splash" — the fish landing back in the water:
a mid-frequency impact at 200-1500Hz (the belly-flop), immediately followed
by water droplets and splash scatter (1-4kHz, 0.4s scatter).
The overall impression: powerful, muscular, wet — the sound of a living body
fighting gravity and water pressure.
Ambient: river/waterfall background noise at very low level.
Reverb: river valley semi-open, 20ms pre-delay, 0.8s decay, 15% wet.
Frequency range: 80Hz-4kHz, with peak at 200-800Hz.
Total duration: 1.5 seconds.
Negative prompt: no music, no human voice, no aquarium bubbles, no gentle water flow,
no rain sound, no cartoon splash, no exaggerated comic effect,
no digital processing artifacts, no synth, no percussion music.
```

**中文解释**：鲑鱼声音——大型鲑鱼跃越瀑布/鱼道的水声。分两阶段：前段"破水而出"（低频水浪 80–500Hz，有力的表面破水感），后段"落水拍击"（中频撞击 200–1500Hz + 水花散落 1–4kHz）。总体感觉有力、肌肉感、湿润。1.5 秒，河谷混响 0.8 秒。

---

#### 5.2e 角马叫声

| 字段 | 内容 |
|------|------|
| **声音类型** | 有叫声——角马嘶鸣 |
| **声音描述** | 1–2 声短促的角马低鸣/嗡鸣，低沉沙哑，带有群体感，像是从兽群中传出 |
| **时长** | 0.8–1.5 秒 |
| **音调** | 低中音，100–800Hz，沙哑、浑厚 |
| **环境混响** | 广阔草原，预延迟 20ms，衰减 0.7 秒，湿声 12% |

**【英文提示词】**

```
Wildlife sound effect, single shot, 1.2 seconds.
Subject: wildebeest — 1-2 short grunt-bellows from a gnu/wildebeest.
Sound: 1-2 short, low-pitched grunting calls characteristic of wildebeest —
the "gnu" sound that gives them their name. Each call 0.3-0.5 seconds.
Character: deep, raspy, resonant — not threatening, just the natural low-frequency
communication grunt of a large bovine mammal in a herd.
The calls should sound like they are coming from within a moving herd —
slightly mixed with the background sound of nearby animals.
Pitch range: 100-800Hz, fundamentally low-frequency with harmonic overtones.
Ambient: light open grassland ambience, distant herd sounds at very low level.
Reverb: vast open grassland, 20ms pre-delay, 0.7s decay, 12% wet.
Total duration: 1.0-1.5 seconds.
Negative prompt: no music, no human voice, no lion roar, no elephant trumpeting,
no domestic cow moo, no aggressive sound, no high-pitched call,
no cartoon animal sound, no exaggerated effect, no distortion.
```

**中文解释**：角马叫声——1–2 声短促低沉的角马鸣叫，沙哑、浑厚，100–800Hz，像是从兽群中传出。带轻微草原背景感。广阔草原混响 0.7 秒，12% 湿声。1.0–1.5 秒。

---

#### 5.2f 美洲鳗声音

| 字段 | 内容 |
|------|------|
| **声音类型** | 无叫声——环境特征音：鳗鱼在浑浊水底蜿蜒游动时拨开水草/泥沙的水下声 |
| **声音描述** | 水下低沉的"滑动"声：像有什么滑腻的东西在泥底拨水穿行，低频水波扰动 + 极轻微的水草/泥沙摩擦感 |
| **时长** | 1.0–2.0 秒 |
| **音调** | 低频水下质感，60–600Hz，持续流动 |
| **环境混响** | 水下/河底封闭空间，预延迟 5ms，衰减 0.6 秒，湿声 25% |

**【英文提示词】**

```
Wildlife foley sound effect, single shot, 1.5 seconds.
Subject: American eel — the sound of a large eel (80-120cm) moving through
murky river bottom water, sliding through sediment and aquatic vegetation.
Sound: a low-frequency, smooth, sliding underwater movement —
the displacement of water by a long, sinuous body moving through silt and water plants.
Character: dark, smooth, slightly mysterious — not dramatic, just the quiet
presence of something large and serpentine moving underwater.
Layer 1: low-frequency water displacement — a soft, continuous low-end rumble
at 60-400Hz, like thick water being pushed aside. Smooth, no sharp transients.
Layer 2: very subtle sediment/vegetation brush — a faint texture at 200-600Hz,
like the body lightly brushing river bottom mud and water grass.
Barely audible, just enough to add "tactile" quality to the movement.
Fade in over 0.2s, sustain for 1.0s, fade out over 0.3s.
No sharp attacks — everything is smooth and continuous.
Reverb: underwater/submerged space, 5ms pre-delay, 0.6s decay, 25% wet.
Frequency range: 60Hz-600Hz, primarily low-mid range.
Total duration: 1.5 seconds.
Negative prompt: no music, no human voice, no dramatic splash, no monster sound,
no horror effect, no sci-fi, no digital drone, no high frequency,
no sharp transient, no percussion, no rattling, no bubbling.
```

**中文解释**：美洲鳗声音——不是叫声，而是大型鳗鱼在浑浊河底蜿蜒游动时的水下滑动声。低频水流拨动（60–400Hz）+ 极轻微泥沙/水草摩擦（200–600Hz）。整体平滑，无尖锐瞬态。水下/河底混响 0.6 秒，25% 湿声。1.5 秒。

---

#### 5.2g 绿海龟声音

| 字段 | 内容 |
|------|------|
| **声音类型** | 无叫声——环境特征音：绿海龟浮出海面呼吸时的声音 |
| **声音描述** | 海龟浮出水面"呼"一口气再吸气的声音：水面破开的轻微水声 + 粗重的呼气/吸气声，带有辽阔海洋背景感 |
| **时长** | 1.5–2.5 秒 |
| **音调** | 低中频呼吸声（100–600Hz）+ 水面破开的轻微中高频水声（500Hz–2kHz） |
| **环境混响** | 海洋开阔空间，预延迟 30ms，衰减 1.5 秒，湿声 22% |

**【英文提示词】**

```
Wildlife foley sound effect, single shot, 2.0 seconds.
Subject: green sea turtle surfacing to breathe —
the sound heard just above the ocean surface as a large sea turtle breaks through
and takes a single breath before submerging again.
Sound in two phases:
Phase 1 (0-0.5s): water surface breaking — the gentle but distinct sound of a large,
smooth creature breaking through the ocean surface. A soft displacement of water
at 500Hz-2kHz, like a large smooth dome emerging — not a splash, more of a parting.
Phase 2 (0.3-1.8s): the breath — a single deep, audible exhalation followed by inhalation.
The exhale is breathy, slightly wet, 100-600Hz, like a large mammal breathing
(think whale breath, scaled down for a sea turtle). Duration 0.6 seconds.
Then a brief inhale (shorter, 0.3 seconds).
Phase 3 (1.5-2.0s): gentle re-entry into water, soft and smooth, no dramatic splash.
The entire sequence should feel: ancient, slow, deliberate, peaceful.
The background should carry a sense of vast open ocean.
Ambient: quiet open ocean surface ambience.
Reverb: vast open ocean space, 30ms pre-delay, 1.5s decay, 22% wet.
Frequency range: 100Hz-2kHz.
Total duration: 2.0 seconds.
Negative prompt: no music, no human voice, no whale song, no dolphin click,
no dramatic underwater roar, no sci-fi, no cartoon sound,
no aggressive splashing, no storm waves, no digital processing artifacts.
```

**中文解释**：绿海龟声音——浮出海面呼吸的声音。三阶段：水面轻轻裂开（500Hz–2kHz，无戏剧性浪花）+ 一次呼气（100–600Hz，粗重湿润，0.6 秒）+ 一次吸气（0.3 秒）+ 轻柔再入水。整体感觉古老、缓慢、从容、平静。辽阔海洋混响 1.5 秒，22% 湿声。总长 2.0 秒。

---

#### 5.2h 林蛙叫声

| 字段 | 内容 |
|------|------|
| **声音类型** | 有叫声——林蛙鸣叫 |
| **声音描述** | 1–2 声林蛙的"嘎嘎"或"克克"短鸣，清脆，带有湿润林地气息，非常短促 |
| **时长** | 0.5–1.0 秒 |
| **音调** | 中高频，500Hz–3kHz，短促清脆 |
| **环境混响** | 湿润林地，预延迟 10ms，衰减 0.5 秒，湿声 18% |

**【英文提示词】**

```
Wildlife sound effect, single shot, 0.7 seconds.
Subject: wood frog (Rana sylvatica or similar woodland frog) —
1-2 short, sharp frog calls heard from a moist forest floor.
Sound: 1-2 calls characteristic of a small woodland frog —
a short, somewhat duck-like "quack" or "clack" call (wood frogs are known for
their duck-like calls). Each call is 0.1-0.2 seconds.
Character: bright, percussive, clean — the kind of frog call heard near
a woodland pond in early spring. Not the deep "ribbit" of a bullfrog —
this is lighter, higher, sharper.
The calls feel close and small — like a tiny creature calling from just a few feet away
among wet leaves.
Ambient: light humid forest ambience — a hint of leaves and moisture.
Reverb: moist enclosed woodland, 10ms pre-delay, 0.5s decay, 18% wet.
Frequency range: 500Hz-3kHz.
Total duration: 0.5-0.8 seconds including ambient tail.
Negative prompt: no music, no human voice, no tropical frog chorus, no bullfrog deep croak,
no cartoon frog sound, no exaggerated ribbit, no reverb wash,
no echo beyond 0.8s, no distortion, no synth effect.
```

**中文解释**：林蛙叫声——1–2 声短促的林蛙鸣叫，清脆明亮（类似鸭叫的"嘎嘎"，林蛙以此著名），500Hz–3kHz，每声 0.1–0.2 秒。不是牛蛙的低沉蛙鸣，而是小型林蛙轻盈短促的近距离呼叫。湿润林地混响 0.5 秒，18% 湿声。0.5–0.8 秒。

---

## 六、统一混音规则

### 6.1 音量层级规范

| 层级 | 音量基准 | 说明 |
|------|---------|------|
| **主旋律** | **0 dB（reference）** | 所有其他音频以此为基准 |
| **物种装饰音轨** | **-7 dB 至 -12 dB** | 每个物种 stem 比主旋律低 7–12 dB，具体值见各物种提示词 |
| **物种声音（叫声/环境音）** | **短暂高于背景 +3 dB** | 触发时清晰可闻，0.5–2.5 秒后自然结束 |
| **通用交互音效峰值** | **短暂高于背景 +2 dB** | 交互音效清晰但不掩盖主旋律超过 0.5 秒 |

### 6.2 频段分配规则

| 频段 | 允许使用的层 | 约束 |
|------|------------|------|
| **40–200 Hz（低频）** | 仅鲑鱼（大提琴）、角马（中提琴低音） | 同时只允许 2 个层在低频活跃 |
| **200–800 Hz（中低频）** | 主旋律、角马、美洲鳗 | 主旋律在此区域有优先权 |
| **800Hz–3kHz（中频）** | 主旋律（马林巴/钢琴）、候鸟（长笛）、林蛙（卡林巴） | 候鸟和林蛙必须错开节奏 |
| **3–8kHz（高频）** | 帝王蝶（钟琴）、斑头雁（短笛）、海龟（钢片琴）、交互音效 | 必须错开节奏——帝王蝶反拍、斑头雁极稀疏、海龟每 4 小节 |
| **8kHz+（极高频）** | 仅交互音效短暂使用 | 音乐层不占据极高频 |

### 6.3 物种音轨频段互补矩阵

```
              40Hz  200Hz  800Hz  3kHz  8kHz
主旋律          ░░     ███    ███    ██    ░░     ← 核心层，中频为主
雁鸭候鸟        ░░     ░░     ██     ██    ░░     ← 中高频领奏
帝王蝶          ░░     ░░     ░░     ██    ██     ← 极高频点状
斑头雁          ░░     ░░     ░░     ██    █      ← 极高频极稀疏
鲑鱼            ███    ██     ░░     ░░    ░░     ← 低频镜像
角马            ██     ██     ░░     ░░    ░░     ← 低中频重量
美洲鳗          ░░     ██     ██     ░░    ░░     ← 中低频暗色连接
绿海龟          ░░     ░░     ░░     ██    █      ← 高频稀有点缀
林蛙            ░░     ░░     ██     ██    ░░     ← 中频颗粒
              ────────────────────────────────
同时活跃层数:   ≤2     ≤3     ≤3     ≤3    ≤2
```

### 6.4 循环与文件规范

| 规范 | 要求 |
|------|------|
| **无缝循环** | 所有音乐片段必须可循环，循环点首尾帧差异 < 0.001（采样级无缝） |
| **淡入淡出** | 循环音频 0.5 秒淡入淡出；一次性音效 5ms 头淡入避免咔哒声 |
| **导出格式** | WAV 44.1kHz 16-bit 立体声（母带）；运行时可转为 OGG/Opus 压缩 |

**文件命名规则**：

```
/public/audio/music/main_theme_loop.wav          ← 主旋律

/public/audio/music/stem_bird.wav                ← 雁鸭候鸟装饰轨
/public/audio/music/stem_butterfly.wav           ← 帝王蝶装饰轨
/public/audio/music/stem_bar_goose.wav           ← 斑头雁装饰轨
/public/audio/music/stem_salmon.wav              ← 鲑鱼装饰轨
/public/audio/music/stem_herd.wav                ← 角马兽群装饰轨
/public/audio/music/stem_eel.wav                 ← 美洲鳗装饰轨
/public/audio/music/stem_sea_turtle.wav          ← 绿海龟装饰轨
/public/audio/music/stem_wood_frog.wav           ← 林蛙装饰轨

/public/audio/sfx/route_drag_start.wav           ← 通用：拖动物种出发
/public/audio/sfx/route_node_pass.wav            ← 通用：连线经过节点
/public/audio/sfx/route_complete.wav             ← 通用：连接到终点结束

/public/audio/sfx/species_bird.wav               ← 雁鸭候鸟叫声
/public/audio/sfx/species_butterfly.wav          ← 帝王蝶翅振嗡鸣
/public/audio/sfx/species_bar_goose.wav          ← 斑头雁叫声
/public/audio/sfx/species_salmon.wav             ← 鲑鱼跃水声
/public/audio/sfx/species_herd.wav               ← 角马叫声
/public/audio/sfx/species_eel.wav                ← 美洲鳗水下滑行声
/public/audio/sfx/species_sea_turtle.wav         ← 绿海龟浮出呼吸声
/public/audio/sfx/species_wood_frog.wav          ← 林蛙叫声
```

---

## 七、游戏接入建议

### 7.1 推荐音频文件结构

```
public/
└── audio/
    ├── music/
    │   ├── main_theme_loop.wav          # 主旋律（全程循环）
    │   ├── stem_bird.wav                # 雁鸭候鸟装饰轨
    │   ├── stem_butterfly.wav           # 帝王蝶装饰轨
    │   ├── stem_bar_goose.wav           # 斑头雁装饰轨
    │   ├── stem_salmon.wav              # 鲑鱼装饰轨
    │   ├── stem_herd.wav                # 角马兽群装饰轨
    │   ├── stem_eel.wav                 # 美洲鳗装饰轨
    │   ├── stem_sea_turtle.wav          # 绿海龟装饰轨
    │   └── stem_wood_frog.wav           # 林蛙装饰轨
    └── sfx/
        ├── route_drag_start.wav         # 通用：拖动出发
        ├── route_node_pass.wav          # 通用：经过节点
        ├── route_complete.wav           # 通用：完成路线
        ├── species_bird.wav             # 雁鸭候鸟叫声
        ├── species_butterfly.wav        # 帝王蝶翅振嗡鸣
        ├── species_bar_goose.wav        # 斑头雁叫声
        ├── species_salmon.wav           # 鲑鱼跃水声
        ├── species_herd.wav             # 角马叫声
        ├── species_eel.wav              # 美洲鳗水下滑行声
        ├── species_sea_turtle.wav       # 绿海龟浮出呼吸声
        └── species_wood_frog.wav        # 林蛙叫声
```

### 7.2 音效触发逻辑

| 游戏操作 | 音效触发 |
|---------|---------|
| 鼠标按下 + 开始拖动物种 | `route_drag_start.wav`（通用）+ `species_[物种].wav`（叠加，物种声音与出发音同时播放） |
| 路线经过每个节点 | `route_node_pass.wav`（通用，每次经过触发一次） |
| 鼠标松开，路线完成 | `route_complete.wav`（通用） |
| 物种解锁 | 对应 `stem_[物种].wav` 淡入 |
| 物种灭绝 | 对应 `stem_[物种].wav` 淡出停止 |

### 7.3 状态映射表

| 游戏状态 | 触发条件（代码来源） | 音频行为 |
|---------|-------------------|---------|
| **游戏开始** | `gameStore.initGame()` | 播放 `main_theme_loop.wav`，音量从 0 淡入，淡入时长 3.0 秒 |
| **物种解锁** | `gameStore.tryUnlockSpeciesForStage()` 成功 | 淡入对应 `stem_[species].wav`，在音轨静默窗口处开始，淡入时长 1.2–2.5 秒 |
| **物种成功迁徙** | 任务结算成功 | 对应 stem 音量短暂提升 2–3 dB，持续 2–4 秒后回落 |
| **物种灭绝** | `extinctSpeciesIds` 新增该物种 | 对应 stem 逐渐淡出并停止，淡出时长 2.5–4.0 秒 |
| **游戏结束** | `gameOver = true` | 主旋律在 3–5 秒内淡出；所有存活物种 stem 同时淡出 |

### 7.4 Web Audio API 实现要点

```typescript
// 推荐：使用 Web Audio API 的 AudioBufferSourceNode + GainNode 架构
// 每个音频文件对应一个独立的 GainNode，可独立控制音量
// 主旋律和所有 stem 同时播放，通过 GainNode 控制各自音量

interface AudioLayer {
  source: AudioBufferSourceNode
  gain: GainNode
  targetVolume: number
  currentVolume: number
}

// 物种 stem 淡入时长（秒）
const FADE_IN_DURATION = {
  bird: 2.0,
  butterfly: 1.5,
  bar_goose: 1.2,
  salmon: 2.5,
  herd: 2.0,
  eel: 2.5,
  sea_turtle: 1.5,
  wood_frog: 1.5
}

// 物种 stem 淡出时长（秒）
const FADE_OUT_DURATION = {
  bird: 3.0,
  butterfly: 2.5,
  bar_goose: 2.0,
  salmon: 2.5,
  herd: 4.0,
  eel: 2.5,
  sea_turtle: 3.0,
  wood_frog: 3.0
}

// 物种 stem 目标音量（dB）
const STEM_TARGET_VOLUME = {
  bird: -8,
  butterfly: -12,
  bar_goose: -11,
  salmon: -7,
  herd: -8,
  eel: -9,
  sea_turtle: -12,
  wood_frog: -10
}

// 拖动物种时的音效触发
function onSpeciesDragStart(speciesId: string, position: Vector2) {
  // 播放通用出发音效
  playOnShot('sfx/route_drag_start.wav')
  // 叠加播放物种专属声音
  playOnShot(`sfx/species_${speciesId}.wav`)
}
```

### 7.5 接入注意事项

1. **浏览器自动播放策略**：首次用户交互（`pointerdown`）前不能播放音频。
2. **并发限制**：同时播放的 AudioBufferSourceNode 建议不超过 20 个（主旋律 1 + 物种轨最多 8 + 交互音效最多 4 = 13，在安全范围内）。
3. **懒加载**：首屏只加载主旋律 + 交互音效（< 5MB），物种 stem 和物种声音在对应物种解锁时懒加载。
4. **标签页隐藏**：`document.visibilitychange` 为 hidden 时降低所有音频音量至 -20dB，恢复时回到原音量。
5. **物种声音音量**：物种声音（叫声/环境音）应在当前背景音量基础上 +3dB 确保可闻，但不超过 -3dBFS 防止削波。

---

## 八、AI 音频创作证据表

> 以下表格用于比赛 PPT，展示每个音频模块的创作过程与公益主题关联。

| # | 音频模块名称 | 使用工具 | 输入提示词摘要 | 生成结果文件名 | 游戏内触发位置 | 对公益主题/生态叙事的作用 |
|---|------------|---------|-------------|-------------|-------------|----------------------|
| 1 | 主旋律循环 | Suno / Udio | D major Lydian, 87 BPM, marimba+piano+harp+glass pad+strings+woodwinds, 75s seamless loop | `main_theme_loop.wav` | 游戏开始时播放，贯穿全程 | 主旋律象征生态链本身——始终存在，物种减少时仍不消失但变得空旷 |
| 2 | 雁鸭候鸟装饰轨 | Suno / Udio | D major pentatonic, 87 BPM, solo alto flute, one octave above main theme, 40% silence, breathy | `stem_bird.wav` | 物种解锁时淡入加入 | 第一个加入的声音，建立"解锁=丰富"的核心反馈 |
| 3 | 帝王蝶装饰轨 | Suno / Udio | D major Lydian, 87 BPM, solo glockenspiel hard mallet, pointillistic, 18-24 notes in 75s | `stem_butterfly.wav` | 物种解锁时淡入加入 | 脆弱的高频闪烁=蝴蝶的易碎美，传达"小物种也有独特声音" |
| 4 | 斑头雁装饰轨 | Suno / Udio | D major pentatonic high register, 87 BPM, solo piccolo, 3-4 call phrases, alpine canyon reverb | `stem_bar_goose.wav` | 物种解锁时淡入加入 | 极高空穿透性鸣叫=高山通道的独特生态位 |
| 5 | 鲑鱼装饰轨 | Suno / Udio | D natural minor, 87 BPM half-time, solo cello, arco + pizzicato, one octave below, underwater | `stem_salmon.wav` | 物种解锁时淡入加入 | 低频镜像=水下世界的深度，传达"河流连通是水生物种生命线" |
| 6 | 角马兽群装饰轨 | Suno / Udio | D major, 87 BPM half-time, solo viola, long bow sustains, subtle chorus for herd feel | `stem_herd.wav` | 物种解锁时淡入加入 | 中频重量感=陆地兽群的大地共振，传达"陆地迁徙通道同样重要" |
| 7 | 美洲鳗装饰轨 | Suno / Udio | D Dorian, 87 BPM, solo bass clarinet, slow glissando curves, breathing pauses | `stem_eel.wav` | 物种解锁时淡入加入 | 暗色滑音=河海连通处的浑浊水域，传达"河流生命通道"理念 |
| 8 | 绿海龟装饰轨 | Suno / Udio | D major pentatonic high, 87 BPM, solo celesta, 2-note phrase every 4 bars, ancient | `stem_sea_turtle.wav` | 物种解锁时淡入加入 | 规律极稀疏的冷冽点缀=古老海洋生物的从容 |
| 9 | 林蛙装饰轨 | Suno / Udio | D major pentatonic mid, 87 BPM, solo kalimba, groups of 2-4 short notes, wet granular | `stem_wood_frog.wav` | 物种解锁时淡入加入 | 微观颗粒=两栖动物脆弱跳跃，传达"小尺度栖息地断裂也会造成繁殖失败" |
| 10 | 通用：拖动出发音效 | MPS 音频 skill | Glass string pluck + air breath + water droplet, 1kHz-8kHz, 0.30s, ethereal, no reverb tail | `route_drag_start.wav` | 玩家拖动任意物种出发瞬间 | 轻盈的"开始"触感，强化"我在主动建设生态通道"的参与感 |
| 11 | 通用：经过节点音效 | MPS 音频 skill | Wood tap + soft chime, 500Hz-5kHz, 0.18s, repeatable, not annoying | `route_node_pass.wav` | 路线经过每个生态节点 | 温柔的连接确认，强化"每一个节点都是生态链的一环" |
| 12 | 通用：完成路线音效 | MPS 音频 skill | Warm breath + ascending micro-glide + crystalline particle scatter, 200Hz-8kHz, 0.80s | `route_complete.wav` | 路线完成，迁徙任务开始 | "路线被生态网络接纳"的收束感，完成保护行动的满足感 |
| 13 | 雁鸭候鸟叫声 | MPS 音频 skill | 1-2 crisp waterbird calls, medium-high pitch, wetland ambience, 0.8-1.2s | `species_bird.wav` | 拖动候鸟物种出发瞬间 | 直接的物种声音认同，玩家感知"我正在帮助这个物种迁徙" |
| 14 | 帝王蝶翅振嗡鸣 | MPS 音频 skill | Collective wing-vibration hum of millions of monarchs in oyamel fir forest, 200Hz-1.5kHz, 1.2s | `species_butterfly.wav` | 拖动帝王蝶物种出发瞬间 | 数百万只蝴蝶集体存在的感觉，传达"物种数量的奇观" |
| 15 | 斑头雁叫声 | MPS 音频 skill | 1-2 high-pitched goose calls, alpine space, 1kHz-6kHz, 1.2s, large reverb | `species_bar_goose.wav` | 拖动斑头雁物种出发瞬间 | 高空穿透性鸣叫，传达斑头雁越越喜马拉雅的极限飞行 |
| 16 | 鲑鱼跃水声 | MPS 音频 skill | Large salmon leaping waterfall — burst out + re-entry splash, 80Hz-4kHz, 1.5s | `species_salmon.wav` | 拖动鲑鱼物种出发瞬间 | 有力的逆流一跃，传达"鲑鱼洄游需要连通的河道" |
| 17 | 角马叫声 | MPS 音频 skill | 1-2 short wildebeest grunt-bellows, low-pitched raspy, grassland, 100-800Hz, 1.2s | `species_herd.wav` | 拖动角马物种出发瞬间 | 浑厚低沉的兽群鸣叫，传达"角马大迁徙是非洲大陆的生命奇观" |
| 18 | 美洲鳗水下滑行声 | MPS 音频 skill | Eel moving through murky river bottom, low-freq water displacement + sediment brush, 60-600Hz, 1.5s | `species_eel.wav` | 拖动美洲鳗物种出发瞬间 | 神秘的水下滑行感，传达"鳗鱼的河海通道至关重要但鲜为人知" |
| 19 | 绿海龟浮出呼吸声 | MPS 音频 skill | Sea turtle surfacing — water parting + single breath exhale/inhale, 100Hz-2kHz, 2.0s | `species_sea_turtle.wav` | 拖动绿海龟物种出发瞬间 | 缓慢古老的呼吸感，传达"海龟存在了上亿年，现在正濒危" |
| 20 | 林蛙叫声 | MPS 音频 skill | 1-2 wood frog calls, duck-like quack, moist forest, 500Hz-3kHz, 0.7s | `species_wood_frog.wav` | 拖动林蛙物种出发瞬间 | 微小清脆的蛙鸣，传达"两栖动物是生态健康的指示物种" |

---

## 九、质量检查清单

### 9.1 主题与叙事检查

- [x] **围绕生物多样性与环境保护主题**：所有音乐和音效均服务于"生态链越完整，音乐越丰富"的核心叙事
- [x] **体现"生态链越完整，音乐越丰富"**：主旋律始终存在，8 个物种各贡献一个装饰轨，物种灭绝时对应轨淡出
- [x] **不新增或替换物种**：严格使用项目设定的 8 个物种（雁鸭候鸟、帝王蝶、斑头雁、鲑鱼、角马兽群、美洲鳗、绿海龟、林蛙）

### 9.2 内容完整性检查

- [x] **包含主旋律规划**：1 条主旋律（无变奏版本，单一循环适应全游戏）
- [x] **包含八个物种装饰音轨**：8 个物种各有完整提示词
- [x] **包含三个通用交互音效**：拖动出发 + 经过节点 + 完成路线，统一空灵风格
- [x] **包含八个物种专属声音**：有叫声者提供叫声（候鸟、斑头雁、角马、林蛙），无叫声者提供相关特征环境音（帝王蝶翅振、鲑鱼跃水、美洲鳗水下滑行、绿海龟呼吸）
- [x] **包含统一混音规则**：音量层级、频段分配、节奏互补、循环与文件规范
- [x] **包含游戏接入建议**：文件结构、触发逻辑、状态映射表、Web Audio API 实现要点

### 9.3 提示词质量检查

- [x] **所有 AI 音乐提示词可直接复制到工具**：每条提示词为独立完整的英文文本块
- [x] **所有音乐提示词包含必填字段**：key/mode、BPM、time signature、loop length、instrumentation、texture、rhythm、mood arc、mixing notes、negative prompt
- [x] **所有音效提示词包含必填字段**：触发情境、拟音参考、时长、频率范围、空间混响、瞬态强度、情绪定位、negative prompt
- [x] **英文提示词 + 中文解释**：每条提示词均有完整英文版本和中文解释
- [x] **未使用知名音乐人或版权作品名称**：所有风格参照均为描述性语言

### 9.4 装饰音轨适用性检查

- [x] **普适性**：每个装饰音轨均可在游戏任意时刻播放而不显突兀
- [x] **易于卡点**：每个装饰音轨均明确标注了"静默窗口/自然进入点"的位置和时长
- [x] **留白充足**：所有装饰音轨静默时间均不低于 30%（林蛙、鲑鱼等约 30%，斑头雁、海龟约 85%）

### 9.5 物种声音合理性检查

- [x] **雁鸭候鸟**：有叫声 — 水鸟鸣叫 ✓
- [x] **帝王蝶**：无叫声 — 集体翅振嗡鸣（符合"数百万只"的群体奇观）✓
- [x] **斑头雁**：有叫声 — 高山雁鸣 ✓
- [x] **鲑鱼**：无叫声 — 跃越瀑布/鱼道的水声（最具代表性的鲑鱼行为）✓
- [x] **角马**：有叫声 — 低沉的 gnu 鸣叫 ✓
- [x] **美洲鳗**：无叫声 — 水下滑行声（符合夜行性、水下、神秘的物种气质）✓
- [x] **绿海龟**：无叫声 — 浮出水面呼吸声（最标志性的海龟行为之一）✓
- [x] **林蛙**：有叫声 — 鸭叫式短促蛙鸣 ✓

### 9.6 生态位互补检查

- [x] **频段不冲突**：8 个物种频段从 80Hz 到 8kHz+ 轮盘式分布，同一频段同时活跃层数 ≤ 3
- [x] **节奏不冲突**：水生物种用连续纹理，陆地/两栖用颗粒短促，飞行物种用跳跃点状，三者互补
- [x] **乐器不重复**：8 个物种 8 种不同乐器（alto flute、glockenspiel、piccolo、cello、viola、bass clarinet、celesta、kalimba）
- [x] **与主旋律兼容**：所有物种调式均与主旋律 D 大调和谐兼容

---
