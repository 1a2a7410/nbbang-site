# 실시간 N빵 정산 사이트

GitHub Pages + Firebase Firestore 기반 실시간 공유 정산 사이트입니다.

## 파일
- `index.html`
- `style.css`
- `app.js`
- `firebase-config.js`

## Firebase 설정
1. Firebase Console에서 프로젝트 생성
2. 웹 앱 추가
3. SDK 설정의 `firebaseConfig` 값을 복사
4. `firebase-config.js` 파일의 값을 교체
5. Firestore Database 생성
6. 테스트용 규칙은 아래처럼 사용 가능하지만, 공개 사이트에서 장기 사용은 비추천

```js
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /trips/{tripId} {
      allow read, write: if true;
    }
  }
}
```

상업적 사용 또는 공개 배포 시에는 로그인/초대코드/권한 규칙을 추가해야 합니다.
