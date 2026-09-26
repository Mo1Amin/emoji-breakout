<div align="center">

<img src="assets/logo.svg" width="88" alt="Playto logo">

# Playto

**Six emoji games for the browser, made for phones first, and every one of them plays online with a friend: no sign-up, just a room code.**

[![Play now](https://img.shields.io/badge/Play%20now-open-ffc83d?style=for-the-badge&logo=googlechrome&logoColor=black)](https://mo1amin.github.io/emoji-breakout/)
![HTML5 Canvas](https://img.shields.io/badge/HTML5%20Canvas-E34F26?style=for-the-badge&logo=html5&logoColor=white)
![WebRTC](https://img.shields.io/badge/WebRTC-333333?style=for-the-badge&logo=webrtc&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)

<img src="docs/preview.png" alt="Playto on desktop and phone" width="100%">

</div>

## 🕹️ The games

| | Game | Online | Offline |
|---|---|---|---|
| 🐍 | **Snake Together**: 20 levels, each with a new idea (portals, gold, mushrooms that flip your controls, mines, guards, a vault that needs both players on its plates, darkness, a maze, a clock, meteors, a shrinking ring, ghosts, and a dragon). When your friend crashes, reach their 🆘 to bring them back for free. | co-op | solo |
| 🍓 | **Four in a Row**: strawberries against lemons, with emoji reactions to throw at your friend. | 1v1 | vs a bot that searches five moves ahead, or two on one phone |
| 🏒 | **Air Hockey**: real-time physics, first to seven. | 1v1, real time | vs bot, or two on one phone laid flat between you |
| 👀 | **Odd One Out**: every emoji looks the same except one; boards grow from 3×3 to 7×7. | race to 10 | 45-second solo run |
| 🚀 | **Emoji Breakout**: the original game, rebuilt with power-ups (🍄 🔥 ⭐ 🐌 ❤️), tough bricks and the old secret codes behind the 🔑 button. | race on the same levels | endless levels |
| 🧠 | **Emoji Memory**: a quick look, then find the pairs. | take turns on one deck | eight levels with stars, or two on one phone |

## 🌐 How online play works

There is no game server. One player creates a room and gets a four-letter code; the other types it in or opens the shared link. [PeerJS](https://peerjs.com/)'s public broker introduces the two browsers, and from then on the game runs over a WebRTC data channel, phone to phone.

| Game | Who decides |
|---|---|
| Snake, Air Hockey | The host runs the simulation; the guest sends input and draws the host's snapshots |
| Odd One Out | The host deals each round and referees who tapped the odd one first |
| Four in a Row, Memory | Each move is sent; both sides check it is legal and in turn before playing it |
| Breakout | Both phones play the same seeded levels and drops, and trade scores live |

A heartbeat notices a friend who locked their phone or lost signal, and offers to carry on alone.

## 🔒 Security

The other phone is treated as untrusted: anyone can open the console and send any JSON down the data channel.

- Every message field is checked before use (`js/online.js`): integers are integers, positions are finite and in range, emoji come from the game's own list, and a dealt deck must hold each face exactly twice. Text from the other side is only ever set with `textContent`.
- Two crashes found in review are fixed: a crafted direction (`"__proto__"`) could stop the Snake host's game loop, and a fractional column (`1.5`) could break Four in a Row.
- Incoming reactions and memory flips are rate-limited or capped, so a flood cannot hang the other phone.
- PeerJS is pinned to one version with a Subresource Integrity hash, and every page ships a Content Security Policy limiting scripts to this site and that one CDN file.
- Room codes are four characters, which is fine for casual play: a room accepts only the first player to join.

## ✨ Details

- Arabic (right to left) and English, switchable on every page
- Light and dark themes that follow the system
- Touch first: swipe or a d-pad for Snake, drag for Breakout, big targets everywhere
- Progress, stars and the Breakout high score are saved in the browser
- The home page draws the pt mark stroke by stroke and the name slides out of it; with `prefers-reduced-motion` it is simply there

## ▶️ Run it

No build step, but the pages use ES modules, so serve the folder instead of opening the file:

```bash
npx serve .
# or
python -m http.server
```

---

<div align="center">Made by <a href="https://github.com/Mo1Amin">Mohamed Amin</a></div>
