import { NextResponse } from 'next/server';
import { getSession } from '@/lib/firestore';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const session = await getSession(id);
        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }
        return NextResponse.json({
            id: session.id,
            persona: session.persona,
            childName: session.childName,
            heroImageUrl: session.heroImageUrl
        });
    } catch (error) {
        console.error("Error fetching session:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
