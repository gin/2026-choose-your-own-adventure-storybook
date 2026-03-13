import { NextRequest, NextResponse } from 'next/server';
import { createSession } from '@/lib/firestore';

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { persona, childName, heroImageUrl } = body;
        
        if (!persona) {
            return NextResponse.json({ error: 'persona is required' }, { status: 400 });
        }
        
        const sessionId = await createSession({
            persona,
            childName,
            heroImageUrl // This will be the base64 captured by webcam
        });
        
        return NextResponse.json({ sessionId });
    } catch (error) {
        console.error("Error creating session:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
