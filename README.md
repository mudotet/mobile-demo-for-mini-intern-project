# Ember & Rune

A React Native + Expo client for the existing mini game server.
The app signs in automatically, opens a real-time 3D fantasy merchant scene, and displays Daily Offers above the Static Shop on one page.
Purchases require confirmation and display the server's actual rewards.
All interface text is English.

Orin is an original animated dealer with eye tracking, blinking, breathing, and a levitating crystal.
Tap him to trigger a short speaking animation with an automatic caption.
The first tap waves with “Welcome to my shop!”, and later taps cycle through a bow, an amused chuckle, and a crystal flourish without repeating the previous tap reaction.
His mouth, lower beard, head, and hands move together for 2.4 seconds before settling back to idle.
Rapid taps select the latest reaction and its matching caption together.
These gestures are silent NPC animations, with no chat input or player replies.
Drag horizontally across the character to orbit the camera and shift his gaze.
The camera retains its angle after release, and vertical swipes scroll Home.
Reduce Motion allows direct camera control and changes the caption and settled expression without continuous animation.
Turning motion back on does not replay earlier taps.
Opening the shop moves the camera through the same 3D scene.
A confirmed purchase opens a full-screen celebration with the same live 3D Orin brought closer to the camera.
The game interface yields to his cheering animation, a reward burst, and a compact Collect control.
Tap Orin to repeat the celebration, then collect the rewards to return to the previous screen.

Three.js and React Three Fiber render the scene through WebGL on web and Expo GL on iPhone.
React Three Fiber 9.8.1 supports React 19.3 and includes the native renderer in its published package.
Animation pauses in the background and respects Reduce Motion.
The scene has a Retry control for graphics initialization or context failures.
A native driver reporting software rendering uses vertex-lit materials, skips shadow maps, and draws at logical pixel resolution before native scaling to reduce CPU work.
Software rendering waits for each native GL frame to drain so tap reactions do not sit behind a backlog of old frames.
Refreshing the scene module recreates its GL context to recover the native renderer after Fast Refresh.
Editing `App.tsx` also remounts the development screen so the native GL tree starts cleanly; the saved Device reconnects automatically.

## Clone

This client lives in [mobile-demo-for-mini-intern-project](https://github.com/mudotet/mobile-demo-for-mini-intern-project).
The backend repository includes it as the `mobile/` Git submodule.
To run the client and backend together, initialize the submodules in the parent checkout.

```bash
git clone --branch release/mobile-demo-2026-11-12 --recurse-submodules https://github.com/mudotet/mini-intern-server-project.git
cd mini-intern-server-project/mobile
```

For an existing parent checkout, switch to `release/mobile-demo-2026-11-12`, then run `git submodule update --init --recursive` from its root.
The parent repository pins a specific mobile commit.

To work on the mobile client independently, clone this repository.

```bash
git clone https://github.com/mudotet/mobile-demo-for-mini-intern-project.git
cd mobile-demo-for-mini-intern-project
npm ci
npm start -- --lan
```

Start the Java backend separately from its own checkout and set the server address through Connection or `EXPO_PUBLIC_API_URL`.
The `npm run backend` helper expects this client at `mobile/` inside the backend checkout.
Battle Pass requires the backend endpoints documented below.

## Run on iPhone

Use Node.js 24 LTS, Java 11, Docker Desktop, and an iPhone on the same Wi-Fi as the Mac.
Expo SDK 58 is pinned in `package.json` for the Expo Go version installed on the demo iPhone.
Use an Expo Go version compatible with SDK 58.

From this folder, install dependencies and start the backend in one terminal.

```bash
npm ci
npm run backend
```

The backend helper builds the existing Java server and listens on all interfaces at port 8080.
It uses the dedicated local DynamoDB table `mini_mobile_demo`, along with the repository's Redis and DynamoDB Local containers.
When starting a new backend process, it generates a process-local JWT secret and uses existing persisted data.
Keep that terminal running.
If the game server already responds on port 8080, the helper reports it and exits successfully.

In a second terminal, run the app.

```bash
npm start -- --lan
```

Install Expo Go on the iPhone, scan the terminal's QR code with Camera, and open the project.
If Expo Go asks for an Expo account, sign in to the same account in Expo Go and Expo CLI using `npx expo login`.
Allow local network access when iOS asks.
The app infers the Mac's address from the Expo development server and calls port 8080.

Open the gear button to correct the address if necessary.
Find the current Wi-Fi address on the Mac with `ipconfig getifaddr en0`.
For example, enter `http://192.168.1.10:8080` in Connection.
Open that address with `/swagger/` appended in iPhone Safari to check whether the phone can reach the backend.
If Safari cannot connect, check the Mac firewall and whether the Wi-Fi network isolates devices.

To set the initial server address explicitly, use an environment variable.

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.10:8080 npm start -- --lan
```

The saved Connection address takes precedence after the first successful address save.
Use the same address consistently, or a stable Mac hostname such as `http://your-mac.local:8080` if it resolves on your network.
Device credentials belong to each server origin, so changing the hostname, IP, scheme, or port selects a different saved Device and may create a new Player.

## Present the flows

1. Open the app to run Login and Player Init automatically.
2. Show the current Gold, Gems, and XP on Home.
3. Enter the Shop and compare Daily Offers with Evergreen Goods, the Static Shop.
4. Select an offer, review its rewards and price, and confirm the purchase.
5. Collect the result and show the updated resources and remaining daily purchases.
6. Open Pass to show the featured reward beside the vertical milestone ladder.
7. Open Daily Quests and claim EXPBP after making Shop purchases, then collect an unlocked milestone.
8. Unlock Premium for 50 Gems and collect any reached Premium rewards.
9. Close and reopen the app to demonstrate the same Player and saved progress.

The demo pass has six milestones at 100 through 600 EXPBP, with separate Free and Premium rewards.
The ladder places higher milestones above lower milestones and shows all twelve reward nodes.
The featured reward and Premium control stay beside the scrolling ladder.
A bright rail connects milestone shields, with reached segments highlighted in gold.
Opening Pass or returning to Milestones centers the current EXPBP milestone; ordinary refreshes preserve manual scrolling.
The weekly season starts Monday at 00:00 Asia/Ho_Chi_Minh.
Daily quests reset at midnight in the same timezone and grant 100 EXPBP for one purchase, 150 EXPBP for three purchases, and 100 EXPBP for receiving 200 XP through Shop purchases.
Claiming a quest adds EXPBP without changing Player XP, and milestone claims retain cumulative EXPBP.
Premium ownership lasts for the current season.
These demo values and reward tables live in `server/src/main/java/com/game_server/general/service/BattlePassCatalog.java`.

Pull down on Home, Shop, or Pass to refresh current resources and offers.
The daily countdown uses the server's time and refreshes the shop at expiry.
Sold-out daily offers are disabled.
Insufficient currency produces an in-game error from the backend.

Device identity and unfinished operations are stored using iOS SecureStore.
Access tokens remain in memory, and the app renews an invalid session through guest login.
If a purchase loses its response, use Check Purchase to resend the same operation and Request ID.
Unfinished Battle Pass actions use Check Battle Pass Action with the original input and Request ID.
Pending Shop and Battle Pass operations survive an app restart and block other mutations until resolved.
This follows the backend's guest login model, where possession of the Device ID permits account recovery.

## Verify locally

```bash
npm run typecheck
npm test
npm run test:live
npm run export:web
npm run preview
```

Open `http://127.0.0.1:8090` for the browser preview.
Its local proxy forwards `/api/` to the real server at `http://127.0.0.1:8080`.
Set `GAME_API_URL` when running preview if the backend uses another address.
Native iPhone requests connect directly to the backend.

With preview and backend running, execute the browser checks.

```bash
npm run test:e2e
npm run test:3d
npm run test:battlepass
```

Browser checks use installed Chrome or Playwright Chromium.
Set `CHROME_EXECUTABLE` to override the executable path.
Screenshots are written to the ignored `artifacts/` directory.
Client tests cover lost responses, retry identity, session renewal, storage failures, and concurrent purchase taps.
Geometry tests check all four greeting poses, visible speech movement, rapid-tap settling, celebration priority, mesh budgets, reduced-motion poses, and GPU resource disposal.
The 3D browser checks verify changing rendered pixels, touch interaction, camera movement, server-confirmed celebrations, background pause, reduced motion, and WebGL recovery.
Live smoke tests create a fresh Player in the configured local backend.
Browser checks verify the React Native web build and actual backend responses.
Battle Pass browser checks cover quest progress, Free/Premium claims, cancellation, server-confirmed celebrations, restart persistence, and a lost claim response retried exactly once.
Physical iPhone rendering, SecureStore, and LAN permission prompts require an on-device check.

The compatible backend and `game/app/battle_pass.proto` schema are published on `release/mobile-demo-2026-11-12` in their respective repositories.
Clone that backend branch recursively to use its pinned schema and mobile revisions.
The backend main branch has a separate Battle Pass contract.

## Artwork

The dealer, his clothing, the crystal, and the shop environment are original procedural meshes defined in `src/dealer/world.ts`.
The scene uses locally constructed geometry and materials.
The earlier AI-generated woodland illustration is retained for the web favicon.
The layout, colors, and item presentation are independently designed.
Resource and navigation glyphs come from Material Community Icons through `@expo/vector-icons`.
Barlow Condensed and Cinzel are bundled locally with their SIL Open Font License files in `assets/`.
