# PieChat — Technical Documentation

> Tài liệu kỹ thuật chi tiết cho nhà phát triển, tích hợp API, và mở rộng hệ thống.

---

## Mục lục

- [1. Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
- [2. Matrix Protocol — Nền tảng](#2-matrix-protocol--nền-tảng)
- [3. Auth Service API](#3-auth-service-api)
- [4. Matrix Client-Server API](#4-matrix-client-server-api)
- [5. Frontend Architecture](#5-frontend-architecture)
- [6. WebRTC Call System](#6-webrtc-call-system)
- [7. Bot Integration Guide](#7-bot-integration-guide)
- [8. API Integration cho Website/Platform](#8-api-integration-cho-websiteplatform)
- [9. Deployment & Scaling](#9-deployment--scaling)
- [10. Security Analysis](#10-security-analysis)

---

## 1. Tổng quan kiến trúc

### System Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                        CLIENTS                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Web/PWA │  │ Android  │  │ Desktop  │  │ External Bot │   │
│  │(Next.js) │  │(Capacitor│  │ (Tauri)  │  │ (HTTP/SDK)   │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬───────┘   │
│       │              │              │               │           │
└───────┼──────────────┼──────────────┼───────────────┼───────────┘
        │              │              │               │
        ▼              ▼              ▼               ▼
┌────────────────────────────────────────────────────────────────┐
│                     NGINX REVERSE PROXY                         │
│                    (SSL termination, routing)                    │
│                                                                  │
│  /chat/* → Frontend:3000     /_matrix/* → Dendrite:8008         │
│  /auth/* → Auth:4000         /media/*   → Dendrite:8008         │
└────────┬──────────────┬────────────────┬───────────────────────┘
         │              │                │
    ┌────▼────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │Frontend │   │   Auth    │   │ Dendrite  │
    │Next.js  │   │ Service   │   │  Matrix   │
    │ SSR+SPA │   │Express.js │   │Homeserver │
    │Port 3000│   │Port 4000  │   │Port 8008  │
    └─────────┘   └───────────┘   └─────┬─────┘
                                        │
                                  ┌─────▼─────┐
                                  │  SQLite/   │
                                  │ PostgreSQL │
                                  └───────────┘
```

### Data Flow

```
User Action → Frontend (Zustand Store) → Matrix API → Dendrite → Database
                                      ↑
                                      │ Polling (2s interval)
                                      │
                            Dendrite → /sync → Frontend → UI Update
```

### Key Design Decisions

| Quyết định | Lý do |
|------------|-------|
| **Dendrite thay vì Synapse** | Nhẹ hơn 10x, single binary, Go thay vì Python |
| **Polling thay vì WebSocket** | Dendrite `/sync` API chỉ hỗ trợ long-polling, đơn giản hóa deploy |
| **Zustand thay vì Redux** | Nhẹ, không boilerplate, perfect cho real-time state |
| **Next.js App Router** | SSR cho SEO, nhưng chủ yếu dùng CSR cho chat |
| **Auth Service riêng** | Matrix không hỗ trợ OTP/phone natively, cần middleware |
| **WebRTC qua Matrix signaling** | Tận dụng Matrix events cho signaling, không cần TURN/STUN server riêng cho LAN |

---

## 2. Matrix Protocol — Nền tảng

### Tại sao Matrix?

Matrix là giao thức nhắn tin **phi tập trung** (decentralized), **mã nguồn mở**, **federation-ready**. PieChat sử dụng Dendrite — implementation nhẹ nhất của Matrix bằng Go.

### Core Concepts

```
┌─────────────────────────────────────────────────┐
│                 Matrix Concepts                  │
│                                                   │
│  User:   @alice:piechart.site                    │
│  Room:   !abcd1234:piechart.site                 │
│  Event:  $eventId (tin nhắn, reaction, call...)  │
│  Server: piechart.site (homeserver)              │
│                                                   │
│  Room Types (PieChat mapping):                   │
│  ├── DM        → Direct Message (1-1)            │
│  ├── Group     → Nhóm chat                       │
│  ├── Channel   → Kênh (chứa nhiều groups)        │
│  └── Assistant → Bot AI conversation             │
└─────────────────────────────────────────────────┘
```

### Matrix API Endpoints (qua Dendrite)

Base URL: `https://piechart.site/_matrix/client/v3/`

| Endpoint | Method | Mô tả |
|----------|--------|--------|
| `/login` | POST | Đăng nhập, nhận access_token |
| `/register` | POST | Đăng ký user mới |
| `/sync` | GET | Long-polling: nhận events mới |
| `/rooms/{roomId}/send/{eventType}/{txnId}` | PUT | Gửi event (tin nhắn, reaction...) |
| `/rooms/{roomId}/messages` | GET | Lấy lịch sử tin nhắn |
| `/rooms/{roomId}/state/{eventType}` | GET/PUT | Room state (tên, topic, avatar...) |
| `/createRoom` | POST | Tạo room mới |
| `/joined_rooms` | GET | Danh sách rooms đã join |
| `/user_directory/search` | POST | Tìm kiếm user |
| `/account/whoami` | GET | Xác minh token |
| `/profile/{userId}` | GET/PUT | Profile (display name, avatar) |
| `/rooms/{roomId}/invite` | POST | Mời user vào room |
| `/rooms/{roomId}/join` | POST | Join room |
| `/rooms/{roomId}/leave` | POST | Rời room |
| `/rooms/{roomId}/read_markers` | POST | Đánh dấu đã đọc |
| `/upload` | POST | Upload media file |
| `/download/{serverName}/{mediaId}` | GET | Download media |

### Authentication Flow

```
┌──────┐        ┌────────────┐        ┌──────────┐        ┌──────────┐
│Client│        │Auth Service│        │ Dendrite │        │SMS Gateway│
└──┬───┘        └─────┬──────┘        └────┬─────┘        └────┬─────┘
   │                  │                    │                    │
   │ POST /auth/request-otp               │                    │
   │  {phone, password, deviceId}         │                    │
   ├─────────────────▶│                    │                    │
   │                  │ POST /login        │                    │
   │                  │ (verify password)  │                    │
   │                  ├───────────────────▶│                    │
   │                  │◀───────────────────┤                    │
   │                  │                    │                    │
   │                  │ trusted device?    │                    │
   │                  │ YES → return {requiresOtp: false, matrixUsername}
   │                  │ NO  → generate OTP │                    │
   │                  │                    │ send SMS           │
   │                  ├────────────────────┼───────────────────▶│
   │◀─────────────────┤                    │                    │
   │ {requiresOtp: true, otpToken, maskedPhone}                │
   │                  │                    │                    │
   │ POST /auth/verify-otp                │                    │
   │  {otpToken, otpCode}                 │                    │
   ├─────────────────▶│                    │                    │
   │                  │ verify & trust     │                    │
   │◀─────────────────┤                    │                    │
   │ {success: true, matrixUsername}       │                    │
   │                  │                    │                    │
   │ POST /_matrix/client/v3/login        │                    │
   ├──────────────────────────────────────▶│                    │
   │◀──────────────────────────────────────┤                    │
   │ {access_token, user_id, device_id}   │                    │
```

---

## 3. Auth Service API

Base URL: `https://piechart.site/auth/`

### POST `/auth/request-otp`

Bước 1 của đăng nhập — xác minh mật khẩu, gửi OTP nếu thiết bị mới.

**Request:**
```json
{
  "phone": "0901234567",
  "password": "MyPassword123",
  "deviceId": "browser_abc123"
}
```

**Response (thiết bị tin cậy — bỏ qua OTP):**
```json
{
  "requiresOtp": false,
  "matrixUsername": "u0901234567"
}
```

**Response (thiết bị mới — cần OTP):**
```json
{
  "requiresOtp": true,
  "otpToken": "otp_1234567890_abcdef",
  "maskedPhone": "****4567",
  "matrixUsername": "u0901234567",
  "devOtp": "123456"  // chỉ có ở development
}
```

**Error responses:**
| Status | Error |
|--------|-------|
| 400 | `Dữ liệu đăng nhập không hợp lệ` |
| 401 | `Sai số điện thoại hoặc mật khẩu` |
| 429 | `Bạn nhập sai quá nhiều lần` (rate limited) |
| 502 | `Không gửi được OTP` (SMS gateway error) |

---

### POST `/auth/verify-otp`

Bước 2 — xác minh mã OTP.

**Request:**
```json
{
  "otpToken": "otp_1234567890_abcdef",
  "otpCode": "123456"
}
```

**Success:**
```json
{
  "success": true,
  "matrixUsername": "u0901234567"
}
```

**Errors:** 400 (missing), 401 (wrong code), 410 (expired), 429 (blocked)

---

### QR Login Flow

Cho phép đăng nhập web bằng cách quét QR code từ mobile app.

```
POST /auth/qr/generate         → { sessionId, qrData }
GET  /auth/qr/status/:sessionId → { status: 'pending' | 'approved' | 'expired' }
POST /auth/qr/approve          → { ok: true, userId }
```

**Flow:**
1. Web gọi `/qr/generate` → hiển thị QR code chứa `sessionId`
2. Web polling `/qr/status/:sessionId` mỗi 2 giây
3. Mobile quét QR → gửi `POST /qr/approve` với `{sessionId, accessToken}`
4. Web nhận `status: approved` với `accessToken` → đăng nhập thành công

---

### GET `/auth/devices`

Liệt kê thiết bị tin cậy.

```
GET /auth/devices?phone=0901234567
→ { devices: [{ deviceId, name, lastUsed, ip }] }
```

### DELETE `/auth/devices`

Thu hồi thiết bị tin cậy (buộc OTP lần đăng nhập kế).

```json
{ "phone": "0901234567", "deviceId": "browser_abc123" }
```

### GET `/auth/login-events`

Lịch sử đăng nhập & hoạt động bảo mật.

```
GET /auth/login-events?phone=0901234567&suspiciousOnly=1&sinceMs=1700000000000
→ { events: [{ type, success, suspicious, timestamp, ip, userAgent, message }] }
```

### GET `/auth/health`

Health check endpoint.

```
GET /auth/health → { status: 'ok', service: 'piechat-auth', timestamp: ... }
```

---

## 4. Matrix Client-Server API

PieChat sử dụng Matrix CS API chuẩn qua `matrix-service.ts`. Dưới đây là các API chính:

### Login (sau khi Auth Service xác minh)

```typescript
POST /_matrix/client/v3/login
{
  "type": "m.login.password",
  "identifier": { "type": "m.id.user", "user": "u0901234567" },
  "password": "MyPassword123",
  "device_id": "PIECHAT_abc",
  "initial_device_display_name": "PieChat Web"
}
→ { "access_token": "syt_...", "user_id": "@u0901234567:piechart.site" }
```

### Sync (Real-time updates)

```typescript
GET /_matrix/client/v3/sync?since=s123&timeout=30000
// Headers: Authorization: Bearer syt_...
→ {
  "rooms": {
    "join": {
      "!roomId:server": {
        "timeline": { "events": [...] },
        "state": { "events": [...] },
        "unread_notifications": { "notification_count": 2 }
      }
    }
  },
  "next_batch": "s124"
}
```

### Send Message

```typescript
PUT /_matrix/client/v3/rooms/{roomId}/send/m.room.message/{txnId}
// Headers: Authorization: Bearer syt_...
{
  "msgtype": "m.text",
  "body": "Xin chào!"
}
```

### PieChat Custom Events

PieChat sử dụng state events tuỳ chỉnh để lưu metadata:

| Event Type | Mô tả | Ví dụ |
|------------|--------|-------|
| `com.piechat.room_type` | Loại room (dm, group, channel) | `{ "type": "group", "channelId": "!abc" }` |
| `com.piechat.friendship` | Trạng thái kết bạn | `{ "status": "accepted", "requester": "@alice:..." }` |
| `com.piechat.channel_roles` | Phân quyền kênh | `{ "@alice:...": "admin" }` |
| `com.piechat.group_roles` | Phân quyền nhóm | `{ "@bob:...": "member" }` |
| `com.piechat.group_priority` | Độ ưu tiên sắp xếp | `{ "priority": 1 }` |
| `com.piechat.restrict_speaking` | Hạn chế phát biểu | `{ "restricted": true }` |
| `m.call.invite` | WebRTC call invite | `{ "offer": { "sdp": "..." } }` |
| `m.call.answer` | WebRTC call accept | `{ "answer": { "sdp": "..." } }` |
| `m.call.hangup` | WebRTC call end | `{ "reason": "user" }` |
| `m.call.candidates` | ICE candidates | `{ "candidates": [...] }` |

---

## 5. Frontend Architecture

### State Management (Zustand)

```
┌─────────────────────────────────────────────────────┐
│                   Zustand Stores                     │
│                                                       │
│  matrix-store    │ Auth, rooms, messages, CRUD        │
│  call-store      │ Call status, streams, remote user  │
│  theme-store     │ Accent color, custom color         │
│  ui-store        │ Sidebar, modals, UI state          │
│  assistant-store │ Bot config, AI model settings      │
│  sticker-store   │ Sticker packs, favorites           │
└─────────────────────────────────────────────────────┘
```

### Component Architecture

```
app/layout.tsx
├── AccentProvider (dynamic CSS variables)
├── PwaRegister (service worker)
└── app/chat/layout.tsx
    ├── Sidebar (desktop)
    │   ├── Tab: Hội thoại (conversations)
    │   ├── Tab: Nhóm (channels + groups)
    │   ├── Tab: Danh bạ (contacts + message requests)
    │   └── Tab: Bot (AI assistants)
    ├── MobileBottomBar
    ├── CallOverlay
    │   ├── AudioVisualizer (Web Audio API)
    │   ├── DeviceSelector (mic/speaker)
    │   └── IncomingCallScreen (voice/video differentiated)
    └── app/chat/[roomId]/page.tsx
        ├── ChatHeader
        ├── MessageList
        │   ├── TextMessage
        │   ├── ImageMessage
        │   ├── StickerMessage
        │   ├── FileMessage
        │   └── EmojiReactions
        └── MessageInput
            ├── StickerPicker
            ├── FileUpload
            └── TypingIndicator
```

### Runtime Configuration

```typescript
// frontend/lib/config.ts
// Hỗ trợ 4 platforms qua runtime detection:
// 1. Web (default) — same-origin inference
// 2. Desktop (Tauri) — window.__TAURI__
// 3. Mobile (Capacitor) — window.Capacitor
// 4. PWA — display-mode: standalone

getConfig() → {
  matrixBaseUrl: string,   // Dendrite URL
  authBaseUrl: string,     // Auth service URL
  platform: 'web' | 'desktop' | 'mobile' | 'pwa',
  isDev: boolean
}
```

---

## 6. WebRTC Call System

### Architecture

```
┌──────────┐                              ┌──────────┐
│ Caller A │                              │ Callee B │
│          │                              │          │
│ 1. getUserMedia()                       │          │
│ 2. createPeerConnection()              │          │
│ 3. createOffer()                       │          │
│ 4. setLocalDescription()              │          │
│ 5. Send m.call.invite ──────────────▶  │          │
│          │                        6. ◀─ setRemoteDescription()
│          │                        7. ◀─ getUserMedia()
│          │                        8. ◀─ createAnswer()
│          │  ◀─────────────── 9. Send m.call.answer
│ 10. setRemoteDescription()             │          │
│          │                              │          │
│ 11. Exchange m.call.candidates ◀──────▶ │          │
│          │                              │          │
│ 12. ICE Connected ═══════════════════   │          │
│     Audio/Video P2P Stream              │          │
└──────────┘                              └──────────┘
```

### Audio Playback (Critical)

Vấn đề phổ biến: audio không phát dù stream có data. PieChat giải quyết bằng **dual approach**:

```typescript
// Method 1: <audio> element (standard)
remoteAudioRef.current.srcObject = remoteStream;
remoteAudioRef.current.play();

// Method 2: AudioContext → destination (fallback)
const ctx = new AudioContext();
const source = ctx.createMediaStreamSource(remoteStream);
source.connect(ctx.destination); // Direct to speakers
```

### Audio Visualization

Sử dụng Web Audio API `AnalyserNode` để đo volume realtime:

```typescript
const analyser = audioCtx.createAnalyser();
analyser.fftSize = 256;
source.connect(analyser); // don't connect to destination (no echo)

// Read frequency data → calculate RMS → render bars
const dataArray = new Uint8Array(analyser.frequencyBinCount);
analyser.getByteFrequencyData(dataArray);
const rms = Math.sqrt(sum / dataArray.length);
const level = Math.min(rms / 100, 1); // 0-1
```

---

## 7. Bot Integration Guide

### Phương pháp 1: Matrix Bot SDK (Recommended)

Bot giao tiếp trực tiếp với Dendrite qua Matrix API chuẩn — giống hệt user thông thường.

```
┌─────────┐     ┌──────────────┐     ┌──────────┐
│ PieChat │────▶│   Dendrite   │◀────│ Your Bot │
│  Users  │     │ (Matrix API) │     │ (SDK)    │
└─────────┘     └──────────────┘     └──────────┘
```

**Bước 1: Tạo bot user**
```bash
# Trên server Dendrite
create-account -config dendrite.yaml -username mybot -password BotPass123
```

**Bước 2: Login bot**
```bash
curl -X POST https://piechart.site/_matrix/client/v3/login \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "m.login.password",
    "identifier": {"type": "m.id.user", "user": "mybot"},
    "password": "BotPass123"
  }'
# → { "access_token": "syt_xxx", "user_id": "@mybot:piechart.site" }
```

**Bước 3: Bot code (Node.js)**
```typescript
import { MatrixClient, SimpleFsStorageProvider, AutojoinRoomsMixin } from "matrix-bot-sdk";

const client = new MatrixClient(
  "https://piechart.site",
  "syt_xxx" // access_token from login
);
AutojoinRoomsMixin.setupOnClient(client);

client.on("room.message", (roomId, event) => {
  if (event.sender === client.getUserId()) return; // ignore own messages
  
  const body = event.content?.body;
  if (body?.startsWith("!help")) {
    client.sendText(roomId, "Available commands: !help, !weather, !translate");
  }
});

await client.start();
console.log("Bot started!");
```

**Bước 4: Bot code (Python)**
```python
import asyncio
from nio import AsyncClient, MatrixRoom, RoomMessageText

client = AsyncClient("https://piechart.site", "@mybot:piechart.site")

async def message_callback(room: MatrixRoom, event: RoomMessageText):
    if event.sender == client.user_id:
        return
    
    if event.body.startswith("!ping"):
        await client.room_send(
            room.room_id,
            "m.room.message",
            {"msgtype": "m.text", "body": "pong! 🏓"}
        )

client.add_event_callback(message_callback, RoomMessageText)

async def main():
    await client.login("BotPass123")
    await client.sync_forever(timeout=30000)

asyncio.run(main())
```

### Phương pháp 2: OpenClaw-style Agent Bot

Tích hợp LLM agent (OpenAI, Groq, Ollama) với khả năng sử dụng tools.

```
┌─────────┐     ┌──────────┐     ┌──────────┐     ┌─────────┐
│ PieChat │────▶│ Dendrite │◀────│ Bot      │────▶│ LLM API │
│  User   │     │          │     │ Gateway  │     │ (GPT/   │
└─────────┘     └──────────┘     │          │     │  Groq/  │
                                  │ Tools:   │     │  Ollama)│
                                  │ ┌──────┐ │     └─────────┘
                                  │ │Search│ │
                                  │ │Web   │ │
                                  │ │Code  │ │
                                  │ │DB    │ │
                                  │ └──────┘ │
                                  └──────────┘
```

**Architecture:**
```typescript
// bot-gateway.ts
class AgentBot {
  private matrixClient: MatrixClient;
  private llm: LLMProvider; // OpenAI, Groq, etc.
  private tools: Tool[];    // Functions the bot can call

  async handleMessage(roomId: string, message: string) {
    // 1. Send typing indicator
    await this.matrixClient.sendTyping(roomId, true);
    
    // 2. Build context from room history
    const history = await this.matrixClient.getRoomMessages(roomId, 20);
    
    // 3. Call LLM with tools
    const response = await this.llm.chat({
      messages: [...history, { role: 'user', content: message }],
      tools: this.tools,
    });
    
    // 4. Execute tool calls if any
    if (response.tool_calls) {
      for (const call of response.tool_calls) {
        const result = await this.executeTool(call);
        // Continue conversation with tool result
      }
    }
    
    // 5. Send response
    await this.matrixClient.sendTyping(roomId, false);
    await this.matrixClient.sendText(roomId, response.content);
  }
}
```

### PieChat Assistant Store Integration

Frontend đã có Assistant system sẵn:

```typescript
// frontend/lib/store/assistant-store.ts
interface AssistantConfig {
  id: string;
  name: string;           // "Code Helper"
  description: string;    // "Hỗ trợ viết code"
  model: string;          // "gpt-4o"
  provider: string;       // "openai" | "groq" | "ollama"
  apiKey: string;
  baseUrl?: string;       // Custom endpoint
  systemPrompt: string;   // Bot personality
  temperature: number;
}
```

---

## 8. API Integration cho Website/Platform

### Embed PieChat Widget

Tích hợp chat widget vào website khác:

```html
<!-- Embed PieChat Widget -->
<script>
  window.__PIECHAT_CONFIG__ = {
    matrixBaseUrl: 'https://piechart.site',
    authBaseUrl: 'https://piechart.site',
  };
</script>
<script src="https://piechart.site/widget.js"></script>
<div id="piechat-widget" data-room="!roomId:piechart.site"></div>
```

### REST API Integration (Backend-to-Backend)

Gửi tin nhắn từ hệ thống bên ngoài:

```python
import requests

MATRIX_URL = "https://piechart.site"
BOT_TOKEN = "syt_xxx"  # Bot access token

# Send message to room
def send_message(room_id: str, message: str):
    txn_id = f"txn_{int(time.time() * 1000)}"
    response = requests.put(
        f"{MATRIX_URL}/_matrix/client/v3/rooms/{room_id}/send/m.room.message/{txn_id}",
        headers={"Authorization": f"Bearer {BOT_TOKEN}"},
        json={"msgtype": "m.text", "body": message}
    )
    return response.json()

# Create notification channel
def create_notification_room(user_id: str, room_name: str):
    response = requests.post(
        f"{MATRIX_URL}/_matrix/client/v3/createRoom",
        headers={"Authorization": f"Bearer {BOT_TOKEN}"},
        json={
            "name": room_name,
            "invite": [user_id],
            "is_direct": True,
            "preset": "trusted_private_chat"
        }
    )
    return response.json()["room_id"]

# Listen for messages (webhook-style)
def poll_messages(since_token: str = ""):
    response = requests.get(
        f"{MATRIX_URL}/_matrix/client/v3/sync",
        headers={"Authorization": f"Bearer {BOT_TOKEN}"},
        params={"since": since_token, "timeout": 30000}
    )
    data = response.json()
    
    for room_id, room_data in data.get("rooms", {}).get("join", {}).items():
        for event in room_data.get("timeline", {}).get("events", []):
            if event["type"] == "m.room.message":
                yield {
                    "room_id": room_id,
                    "sender": event["sender"],
                    "body": event["content"].get("body", ""),
                    "timestamp": event["origin_server_ts"]
                }
    
    return data.get("next_batch", "")
```

### Webhook Integration

Gửi webhook khi có tin nhắn mới:

```typescript
// Bot lắng nghe tin nhắn → forward tới webhook URL
client.on("room.message", async (roomId, event) => {
  await fetch("https://your-app.com/webhook/piechat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event: "message",
      room_id: roomId,
      sender: event.sender,
      content: event.content.body,
      timestamp: event.origin_server_ts,
    })
  });
});
```

### SDK Architecture (Planned)

```
┌─────────────────────────────────────┐
│         @piechat/sdk                │
│                                      │
│  class PieChatClient {              │
│    login(phone, password)           │
│    sendMessage(roomId, text)        │
│    onMessage(callback)              │
│    getRooms()                       │
│    createRoom(name, members)        │
│    uploadFile(roomId, file)         │
│    startCall(roomId, type)          │
│  }                                  │
│                                      │
│  // Usage:                          │
│  const chat = new PieChatClient({   │
│    baseUrl: 'https://piechart.site' │
│  });                                │
│  await chat.login('0901234567',     │
│                    'password');      │
│  chat.onMessage((msg) => {          │
│    console.log(msg.body);           │
│  });                                │
└─────────────────────────────────────┘
```

---

## 9. Deployment & Scaling

### Single Server (hiện tại — 1k-5k users)

```
Oracle Cloud Free Tier:
├── 4 ARM cores, 24GB RAM
├── Docker Compose (all services)
├── Nginx + Let's Encrypt SSL
└── SQLite (built-in Dendrite)
```

### Scaling Strategy (5k-50k users)

```
Phase 1: Vertical Scaling
├── Upgrade to 8 cores, 32GB RAM
├── Switch SQLite → PostgreSQL
└── Add PgBouncer (connection pooling)

Phase 2: Service Separation
├── Dendrite on dedicated server
├── Frontend + Auth on CDN edge
├── PostgreSQL on managed DB (RDS)
└── Media storage → S3/MinIO

Phase 3: Horizontal Scaling (50k+)
├── Multiple Dendrite instances (federation)
├── Redis for session/cache
├── CDN for media delivery
└── Load balancer (HAProxy/Nginx)
```

### Performance Tuning

```yaml
# Dendrite config optimizations
global:
  max_open_conns: 100
  cache:
    max_size_estimated: 1gb
    max_age: 1h
  jetstream:
    max_outstanding_messages: 8192

sync_api:
  search:
    enabled: true
    index_path: /data/searchindex
```

---

## 10. Security Analysis

### Threat Model

| Threat | Mitigation |
|--------|-----------|
| Brute-force password | Rate limiting (5 fails → 15min block) |
| OTP spam | Rate limiting (3 OTP/5min) |
| Token theft | Short-lived sessions, device management |
| XSS | React auto-escaping, CSP headers |
| CSRF | SameSite cookies, token-based auth |
| Man-in-the-middle | TLS 1.3 everywhere |
| Unauthorized room access | Matrix power levels, server ACLs |

### Security Checklist

- [x] HTTPS everywhere (Let's Encrypt)
- [x] OTP 2FA for new devices
- [x] Rate limiting on auth endpoints
- [x] Login audit trail
- [x] Device trust management
- [x] Content Security Policy
- [ ] End-to-end encryption (E2EE) — planned
- [ ] Message retention policies — planned
- [ ] IP-based geo blocking — planned

### Data Flow Security

```
Client ─── HTTPS/TLS 1.3 ──▶ Nginx ─── HTTP ──▶ Dendrite
                                    │
                                    └──── HTTP ──▶ Auth Service
```

> **Lưu ý:** Giao tiếp giữa Nginx ↔ Dendrite/Auth là HTTP nội bộ Docker network (không expose ra internet). Chỉ Nginx expose port 80/443.

---

## Appendix

### Environment Variables

| Variable | Required | Default | Mô tả |
|----------|----------|---------|--------|
| `DOMAIN` | ✅ | - | Domain name |
| `MATRIX_SERVER_NAME` | ✅ | - | Matrix server identifier |
| `SSL_EMAIL` | ✅ | - | Let's Encrypt email |
| `REGISTRATION_SHARED_SECRET` | ✅ | - | Dendrite admin secret |
| `CORS_ORIGINS` | ❌ | `https://${DOMAIN}` | Allowed CORS origins |
| `DEV_MATRIX_PASSWORD` | ❌ | `Pass@12345` | Dev password bypass |
| `SMS_PROVIDER` | ❌ | `webhook` | SMS provider type |
| `SMS_WEBHOOK_URL` | ❌ | - | SMS gateway endpoint |
| `SMS_BRANDNAME` | ❌ | `PieChat` | SMS sender name |

### Useful Commands

```bash
# Docker
docker compose up -d --build          # Start all
docker compose logs -f frontend       # Tail frontend logs
docker compose restart dendrite        # Restart Dendrite

# Dendrite admin
docker exec -it piechat-dendrite /usr/bin/create-account \
  -config /etc/dendrite/dendrite.yaml \
  -username newuser -password MyPass123

# SSL renewal
docker compose exec certbot certbot renew

# Database backup
docker exec piechat-dendrite tar czf /tmp/backup.tar.gz /data/
docker cp piechat-dendrite:/tmp/backup.tar.gz ./backup-$(date +%Y%m%d).tar.gz
```

---

<p align="center">
  <em>PieChat Technical Documentation v1.0 — Last updated: March 2026</em>
</p>
