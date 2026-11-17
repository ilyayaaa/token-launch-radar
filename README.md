# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/ilyayaaa/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/ilyayaaa/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that ranks 193 DefiLlama protocols with no token on record by an implied launch value, fitted on the 128 tokens that already trade (a Huber robust size curve and shrunk median category effects; 7-day growth and time with no token are shown as context, since leave-one-out was better without them) and tested leave-one-out against the earlier least-squares model and a flat-multiple baseline, with a costed farm plan for every row. Its budget planner takes your own capital and weekly hours, re-ranks every protocol by your net payout per hour, and splits the capital greedily across the 3 to 6 best farms, showing deposits, gas, hours and the expected payout range.

![cover](screenshots/1-board.jpg)

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=rv7zbbj2&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
