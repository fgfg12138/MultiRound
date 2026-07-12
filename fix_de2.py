import sys
sys.stdout.reconfigure(encoding='utf-8')
with open('electron/discussion-runner.ts', 'r', encoding='utf-8') as f:
    c = f.read()

bs = chr(92)  # backslash character

# Fix reveal: replace literal backslash-n in the file
old_reveal = "被杀害了。" + bs + "n（死者：" + "' + actions.deaths.map((d: any) => rt.characters.find((c: any) => c.id === d.characterId)?.name).join('、') + '" + bs + "n请用庄重的语气宣布结果，不要透露死者的身份。然后请存活角色开始发言。"
new_reveal = "被杀害了。" + bs + "n【公布要求】只宣布死亡名单，不透露刀杀/毒杀细节，不透露存活者身份，不分析谁可能是狼，不下裁判结论。请庄重宣布，然后说：请存活角色开始发言。"
c = c.replace(old_reveal, new_reveal)

# Fix tie breaker
old_tie = "投票平局。请裁定放逐谁？目标：" + "' + Object.keys(tally).join('、') + '" + bs + "n输出 JSON：{\"vote\": \"角色ID\"}"
new_tie = "投票平局。" + bs + "n【主持人约束】你无权下身份结论，只能执行重投或随机决定。" + bs + "n目标：" + "' + Object.keys(tally).join('、') + '" + bs + "n输出 JSON：{\"vote\": \"角色ID\"}"
c = c.replace(old_tie, new_tie)

with open('electron/discussion-runner.ts', 'w', encoding='utf-8') as f:
    f.write(c)
print('D+E fixed')
