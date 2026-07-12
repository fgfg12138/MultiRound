import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('electron/discussion-runner.ts', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace(
    "天亮了。公布昨晚结果：' + deathNames + ' 被杀害了。\n（死者：' + actions.deaths.map((d: any) => rt.characters.find((c: any) => c.id === d.characterId)?.name).join('、') + '）\n请用庄重的语气宣布结果，不要透露死者的身份。然后请存活角色开始发言。",
    "天亮了。公布昨晚结果：' + deathNames + ' 被杀害了。\n【公布要求】只宣布死亡名单，不透露刀杀/毒杀细节，不透露存活者身份，不分析谁可能是狼，不下裁判结论。请庄重宣布，然后说：请存活角色开始发言。"
)

c = c.replace(
    "投票平局。请裁定放逐谁？目标：' + Object.keys(tally).join('、') + '\n输出 JSON：{\"vote\": \"角色ID\"}",
    "投票平局。\n【主持人约束】你无权下身份结论，只能执行重投或随机决定。\n目标：' + Object.keys(tally).join('、') + '\n输出 JSON：{\"vote\": \"角色ID\"}"
)

with open('electron/discussion-runner.ts', 'w', encoding='utf-8') as f:
    f.write(c)
print('D+E fixed')
