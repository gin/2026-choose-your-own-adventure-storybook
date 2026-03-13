import { Firestore, FieldValue } from '@google-cloud/firestore';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const useLocal = process.env.USE_LOCAL_MOCKS === 'true' || !process.env.GCS_BUCKET_NAME;
const localDbPath = path.join(process.cwd(), '.local-db.json');

// Initialize Firestore and ignore undefined properties inside documents
export const firestore = useLocal ? null : new Firestore({
    ignoreUndefinedProperties: true
});

function getLocalDb() {
    if (!fs.existsSync(localDbPath)) return {};
    return JSON.parse(fs.readFileSync(localDbPath, 'utf8'));
}

function saveLocalDb(data: any) {
    fs.writeFileSync(localDbPath, JSON.stringify(data, null, 2));
}

export interface StorySession {
    id: string;
    persona: string; // 'owl' | 'frog' | 'turtle' | 'capybara'
    childName?: string;
    heroImageUrl?: string; // Captured from webcam / photo
    history: { role: 'user' | 'model', text: string }[];
    createdAt: Date;
    updatedAt: Date;
}

const SESSIONS_COLLECTION = 'story_sessions';

export async function createSession(data: Partial<StorySession>): Promise<string> {
    const sessionId = uuidv4();
    const sessionData: StorySession = {
        id: sessionId,
        persona: data.persona || 'capybara',
        childName: data.childName,
        heroImageUrl: data.heroImageUrl,
        history: [],
        createdAt: new Date(),
        updatedAt: new Date(),
    };
    
    if (useLocal) {
        const db = getLocalDb();
        db[sessionId] = sessionData;
        saveLocalDb(db);
        return sessionId;
    }

    const docRef = firestore!.collection(SESSIONS_COLLECTION).doc(sessionId);
    await docRef.set(sessionData);
    return sessionId;
}

export async function getSession(id: string): Promise<StorySession | null> {
    if (useLocal) {
        const db = getLocalDb();
        return db[id] || null;
    }

    const doc = await firestore!.collection(SESSIONS_COLLECTION).doc(id).get();
    if (!doc.exists) return null;
    return doc.data() as StorySession;
}

export async function appendToSessionHistory(id: string, role: 'user' | 'model', text: string) {
    if (useLocal) {
        const db = getLocalDb();
        if (db[id]) {
            db[id].history.push({ role, text });
            db[id].updatedAt = new Date();
            saveLocalDb(db);
        }
        return;
    }

    const docRef = firestore!.collection(SESSIONS_COLLECTION).doc(id);
    await docRef.update({
        history: FieldValue.arrayUnion({ role, text }),
        updatedAt: new Date()
    });
}

export async function updateSessionHeroImage(id: string, heroImageUrl: string) {
    if (useLocal) {
        const db = getLocalDb();
        if (db[id]) {
            db[id].heroImageUrl = heroImageUrl;
            db[id].updatedAt = new Date();
            saveLocalDb(db);
        }
        return;
    }

    const docRef = firestore!.collection(SESSIONS_COLLECTION).doc(id);
    await docRef.update({ heroImageUrl, updatedAt: new Date() });
}
