with open('src/pages/Create.tsx', 'r', encoding='utf-8') as f:
    c = f.read()

# 1. Add game module state vars after goal state
old_state = "  const [goalCriteria, setGoalCriteria] = useState('');"
new_state = old_state + "\n\n  // Game modules\n  const [gameMode, setGameMode] = useState<'discussion' | 'werewolf'>('discussion');\n  const [modNightAction, setModNightAction] = useState(false);\n  const [modVote, setModVote] = useState(false);\n  const [modDeathSilence, setModDeathSilence] = useState(false);\n  const [modWinCheck, setModWinCheck] = useState(false);\n  const [modPhaseIndicator, setModPhaseIndicator] = useState(false);"
c = c.replace(old_state, new_state)

# 2. Add modules to handleSubmit rt object
# Before the closing of the rt object
old_rt = "        goal: { type: goalType, description: goalDesc.trim() || scenarioTitle.trim(), successCriteria: goalCriteria.trim() || undefined },\n        status: 'created', createdAt: Date.now(),\n      };"
new_rt = "        goal: { type: goalType, description: goalDesc.trim() || scenarioTitle.trim(), successCriteria: goalCriteria.trim() || undefined },\n        modules: { nightAction: modNightAction, vote: modVote, deathSilence: modDeathSilence, winCheck: modWinCheck, phaseIndicator: modPhaseIndicator },\n        gameMode: gameMode,\n        status: 'created', createdAt: Date.now(),\n      };"
c = c.replace(old_rt, new_rt)

# 3. Add game modules section between rules (section 5) and goal (section 6)
old_gap = "          {/* ===== 5. 讨论规则 ===== */}"
new_gap = """          {/* ===== 5.1 游戏模块 ===== */}
          <section className="space-y-3">
            <h2 className="text-lg font-semibold text-g900 flex items-center gap-2"><SectionNum n={6} />游戏模块 <span className="text-xs font-normal text-g400 ml-1">（可自定义组合，默认全关）</span></h2>
            <div className="flex gap-3 mb-3">
              <button type="button" onClick={() => { setGameMode('discussion'); setModNightAction(false); setModVote(false); setModDeathSilence(false); setModWinCheck(false); setModPhaseIndicator(false); }} className={'px-4 py-2 text-sm rounded-r-lg transition-colors ' + (gameMode === 'discussion' ? 'bg-p600 text-white' : 'bg-g100 text-g600 hover:bg-g200')}>讨论模式</button>
              <button type="button" onClick={() => { setGameMode('werewolf'); setModNightAction(true); setModVote(true); setModDeathSilence(true); setModWinCheck(true); setModPhaseIndicator(true); }} className={'px-4 py-2 text-sm rounded-r-lg transition-colors ' + (gameMode === 'werewolf' ? 'bg-p600 text-white' : 'bg-g100 text-g600 hover:bg-g200')}>狼人杀模式</button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 bg-g50 p-4 rounded-r-xl">
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={modNightAction} onChange={e => setModNightAction(e.target.checked)} className="rounded" />夜晚行动</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={modVote} onChange={e => setModVote(e.target.checked)} className="rounded" />投票放逐</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={modDeathSilence} onChange={e => setModDeathSilence(e.target.checked)} className="rounded" />死亡停言</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={modWinCheck} onChange={e => setModWinCheck(e.target.checked)} className="rounded" />胜负判定</label>
              <label className="flex items-center gap-2 text-sm cursor-pointer"><input type="checkbox" checked={modPhaseIndicator} onChange={e => setModPhaseIndicator(e.target.checked)} className="rounded" />阶段指示</label>
            </div>
          </section>

          {/* ===== 5. 讨论规则 ===== */}"""
c = c.replace(old_gap, new_gap)

# 4. Expand SecretRole dropdown (at line 363 area)
old_select = """                                      <option value="normal">normal 普通角色</option>
                                      <option value="fraudster">fraudster 欺诈者</option>
                                      <option value="detective">detective 侦探</option>
                                      <option value="observer">observer 观察者</option>"""
new_select = """                                      <option value="normal">normal 普通角色</option>
                                      <option value="werewolf">werewolf 狼人</option>
                                      <option value="seer">seer 预言家</option>
                                      <option value="witch">witch 女巫</option>
                                      <option value="guard">guard 守卫</option>
                                      <option value="hunter">hunter 猎人</option>
                                      <option value="villager">villager 村民</option>
                                      <option value="fraudster">fraudster 欺诈者</option>
                                      <option value="detective">detective 侦探</option>
                                      <option value="observer">observer 观察者</option>"""
c = c.replace(old_select, new_select)

with open('src/pages/Create.tsx', 'w', encoding='utf-8') as f:
    f.write(c)
print('Create.tsx patched')
