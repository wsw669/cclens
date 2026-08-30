# -*- coding: utf-8 -*-
"""分析本机 Claude Code 会话JSONL，统计token与成本（用于模块A的开发验证）"""
import json
import sys
import glob
import os
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8')

files = glob.glob(os.path.expanduser(r"~/.claude/projects/**/*.jsonl"), recursive=True)

# 1. 找一条真实usage样本
sample = None
for f in files:
    for line in open(f, encoding='utf-8', errors='ignore'):
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get('type') == 'assistant':
            u = d.get('message', {}).get('usage', {})
            if u.get('input_tokens'):
                sample = {
                    'model': d['message'].get('model'),
                    'usage': u,
                    'file': os.path.basename(f),
                }
                break
    if sample:
        break

print('=== 真实usage样本 ===')
print(json.dumps(sample, ensure_ascii=False, indent=2))

# 2. 各模型token统计
model_stats = defaultdict(lambda: {'in': 0, 'out': 0, 'cache_read': 0, 'cache_create': 0, 'n': 0})
for f in files:
    for line in open(f, encoding='utf-8', errors='ignore'):
        try:
            d = json.loads(line)
        except Exception:
            continue
        if d.get('type') == 'assistant':
            m = d.get('message', {}).get('model', 'unknown')
            u = d.get('message', {}).get('usage', {})
            if u.get('input_tokens') or u.get('output_tokens'):
                s = model_stats[m]
                s['in'] += u.get('input_tokens', 0)
                s['out'] += u.get('output_tokens', 0)
                s['cache_read'] += u.get('cache_read_input_tokens', 0)
                s['cache_create'] += u.get('cache_creation_input_tokens', 0)
                s['n'] += 1

print('\n=== 各模型token统计 ===')
for m, s in sorted(model_stats.items(), key=lambda x: -x[1]['in']):
    print(f"  {m}: 输入{s['in']:,} 输出{s['out']:,} 缓存读{s['cache_read']:,} 缓存写{s['cache_create']:,} 消息数{s['n']}")
