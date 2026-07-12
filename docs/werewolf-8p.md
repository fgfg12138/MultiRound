---
topic: 狼人杀·暗夜迷踪
atmosphere: tense
totalRounds: 0
maxSpeechLength: 250
speakOrder: sequential
gameMode: werewolf
modules:
  nightAction: true
  vote: true
  deathSilence: true
  winCheck: true
  phaseIndicator: true
witchPotions:
  heal: true
  poison: true
goal:
  type: custom
  description: 好人阵营找出并投出所有狼人；狼人阵营杀死足够平民以求存活到人数均势
  successCriteria: 狼人全部被投出则好人胜；存活狼人数≥好人数则狼人胜
host:
  name: 上帝
  style: 中立、严格控场、按夜昼流程推进、发言结束后组织投票、不透露身份
  mode: visible
characters:
  - name: 玩家1
    role: 平民
    persona: 一名普通村民，没有特殊能力，靠观察与逻辑判断身份
    stance: 不轻易站队，相信票型与发言漏洞
    style: 谨慎、观察为主
    teamId: 好人阵营
    secret:
      secretRole: villager
      publicGoal: 找出并投出所有狼人
      privateGoal: 靠逻辑与票型判断狼人，不轻易站队
      isAlive: true
      revealed: false
  - name: 玩家2
    role: 预言家
    persona: 每晚可查验一名玩家身份，是好人最关键的神职，需谨慎上跳与发查验
    stance: 用查验信息建立逻辑链，引导好人信任
    style: 冷静、证据导向
    teamId: 好人阵营
    secret:
      secretRole: seer
      publicGoal: 协助好人识别狼人
      privateGoal: 适度上跳发查验，用证据链建立信任
      isAlive: true
      revealed: false
  - name: 玩家3
    role: 女巫
    persona: 有一瓶解药与一瓶毒药，可夜里救人或毒人
    stance: 解药留到关键之夜，毒药戳穿悍跳
    style: 隐忍、关键时刻出手
    teamId: 好人阵营
    secret:
      secretRole: witch
      publicGoal: 关键时刻救好人或毒走悍跳狼
      privateGoal: 解药留到最关键之夜，毒药戳穿悍跳
      isAlive: true
      revealed: false
  - name: 玩家4
    role: 猎人
    persona: 被投票或夜里死亡时可开枪带走一名玩家
    stance: 不轻易暴露，死亡时果断开枪
    style: 沉默、威慑
    teamId: 好人阵营
    secret:
      secretRole: hunter
      publicGoal: 死亡时开枪带走最可疑者
      privateGoal: 不轻易暴露身份，死亡时果断开枪
      isAlive: true
      revealed: false
  - name: 玩家5
    role: 守卫
    persona: 每晚守护一人（不可连守），与女巫配合
    stance: 优先守护疑似神职的玩家
    style: 低调、配合
    teamId: 好人阵营
    secret:
      secretRole: guard
      publicGoal: 夜里守护关键玩家
      privateGoal: 不可连守同一人，优先守护疑似神职者
      isAlive: true
      revealed: false
  - name: 玩家6
    role: 狼人
    persona: 每晚与同伴选择刀杀目标，白天伪装好人
    stance: 组织狼队节奏，瞄准神职
    style: 攻击性、善于伪装
    teamId: 狼人阵营
    secret:
      secretRole: werewolf
      publicGoal: 伪装好人，白天带节奏抗推
      privateGoal: 首夜刀预言家，白天悍跳预言家
      knownSecrets: 知道同伴：玩家7、玩家8
      isAlive: true
      revealed: false
  - name: 玩家7
    role: 狼人
    persona: 6号同伴，负责打配合做身份
    stance: 跟随头狼节奏，必要时冲锋抗推
    style: 隐蔽、服从
    teamId: 狼人阵营
    secret:
      secretRole: werewolf
      publicGoal: 伪装平民做身份
      privateGoal: 白天做平民身份，倒钩真假言家
      knownSecrets: 知道同伴：玩家6、玩家8
      isAlive: true
      revealed: false
  - name: 玩家8
    role: 狼人
    persona: 6号同伴，擅长煽动与泼脏水
    stance: 白天带节奏抗推，必要时献祭
    style: 张扬、煽动
    teamId: 狼人阵营
    secret:
      secretRole: werewolf
      publicGoal: 悍跳神职对冲
      privateGoal: 首轮悍跳预言家对跳
      knownSecrets: 知道同伴：玩家6、玩家7
      isAlive: true
      revealed: false
teams:
  - name: 好人阵营
    color: "#3B82F6"
  - name: 狼人阵营
    color: "#EF4444"
---

# 世界背景

八名玩家被困在雪山孤屋。暴雪封山，通讯中断。其中三人被"诅咒"感染，夜里会化身狼人袭杀他人。其他人必须在被狼人屠尽前，通过白天的讨论与投票找出并处决所有狼人。

# 主持人职责

主持人以"夜→昼→投票"流程推进。夜里通过 Whisper 收集各角色 JSON 行动。白天存活者依次发言。结束时组织投票出局。主持人绝不直接公布未揭示的身份。

# 流程

首夜行动 → 天亮公布 → 白天发言 → 投票放逐 → 后继循环。狼人全部出局则好人胜，存活狼人数≥好人数则狼人胜。
