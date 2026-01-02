import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../.env') });

const baseUrl = 'http://localhost:3000';
const analysisId = '84f35119-bed2-47b2-82dd-66c056e3eb35';

async function testEndpoints() {
  console.log('\n🧪 Testing API Endpoints...\n');

  // Test 1: Comments
  console.log('📝 Testing /api/analyses/[id]/comments');
  try {
    const commentsRes = await fetch(`${baseUrl}/api/analyses/${analysisId}/comments`);
    console.log('Status:', commentsRes.status);
    if (commentsRes.ok) {
      const data = await commentsRes.json();
      console.log('✅ Comments fetched:', data.comments?.length || 0, 'comments');
      if (data.comments?.[0]) {
        console.log('   First comment:', {
          content: data.comments[0].content,
          hasProfile: !!data.comments[0].profiles,
          profileName: data.comments[0].profiles?.full_name
        });
      }
    } else {
      const error = await commentsRes.text();
      console.log('❌ Error:', error);
    }
  } catch (error: any) {
    console.log('❌ Fetch error:', error.message);
  }

  console.log('\n❤️  Testing /api/analyses/[id]/stats/likes');
  try {
    const likesRes = await fetch(`${baseUrl}/api/analyses/${analysisId}/stats/likes`);
    console.log('Status:', likesRes.status);
    if (likesRes.ok) {
      const data = await likesRes.json();
      console.log('✅ Likes count:', data.count);
    } else {
      const error = await likesRes.text();
      console.log('❌ Error:', error);
    }
  } catch (error: any) {
    console.log('❌ Fetch error:', error.message);
  }

  console.log('\n⭐ Testing /api/analyses/[id]/ratings');
  try {
    const ratingsRes = await fetch(`${baseUrl}/api/analyses/${analysisId}/ratings`);
    console.log('Status:', ratingsRes.status);
    if (ratingsRes.ok) {
      const data = await ratingsRes.json();
      console.log('✅ Ratings:', {
        average: data.averageRating,
        total: data.totalRatings,
        userRating: data.userRating
      });
    } else {
      const error = await ratingsRes.text();
      console.log('❌ Error:', error);
    }
  } catch (error: any) {
    console.log('❌ Fetch error:', error.message);
  }

  console.log('\n💬 Testing /api/analyses/[id]/stats/comments');
  try {
    const commentsCountRes = await fetch(`${baseUrl}/api/analyses/${analysisId}/stats/comments`);
    console.log('Status:', commentsCountRes.status);
    if (commentsCountRes.ok) {
      const data = await commentsCountRes.json();
      console.log('✅ Comments count:', data.count);
    } else {
      const error = await commentsCountRes.text();
      console.log('❌ Error:', error);
    }
  } catch (error: any) {
    console.log('❌ Fetch error:', error.message);
  }
}

testEndpoints();
