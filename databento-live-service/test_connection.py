"""
Quick connection test for Databento Live API

Tests:
1. API key validity
2. Connection to Live gateway
3. Symbol subscription
4. Quote reception
"""

import os
import sys
from dotenv import load_dotenv
import databento as db

load_dotenv()

def test_connection():
    print("=" * 60)
    print("Databento Live API Connection Test")
    print("=" * 60)

    api_key = os.getenv('DATABENTO_API_KEY')

    if not api_key:
        print("❌ DATABENTO_API_KEY not found in .env")
        return False

    print(f"✅ API Key found: {api_key[:8]}...{api_key[-4:]}")

    try:
        print("\n📡 Creating Live client...")
        client = db.Live(key=api_key)
        print("✅ Client created successfully")

        print("\n📊 Subscribing to test symbol (SPX)...")
        client.subscribe(
            dataset='OPRA.PILLAR',
            schema='mbp-1',
            symbols=['SPXW250110C06150000'],  # Example SPX option
            stype_in='raw_symbol'
        )
        print("✅ Subscription successful")

        print("\n🎯 Starting stream (will receive 3 quotes then stop)...")
        client.start()

        quote_count = 0

        for record in client:
            quote_count += 1

            bid = getattr(record, 'bid_px_00', 0) / 1e9 if hasattr(record, 'bid_px_00') else 0
            ask = getattr(record, 'ask_px_00', 0) / 1e9 if hasattr(record, 'ask_px_00') else 0
            mid = (bid + ask) / 2 if bid and ask else 0

            print(f"   Quote #{quote_count}: bid=${bid:.4f} ask=${ask:.4f} mid=${mid:.4f}")

            if quote_count >= 3:
                break

        client.stop()
        print("\n✅ Successfully received quotes!")
        print("\n" + "=" * 60)
        print("🎉 Connection test PASSED")
        print("=" * 60)
        print("\nYou're ready to run the service!")
        print("Run: python src/main.py")

        return True

    except Exception as e:
        print(f"\n❌ Error: {e}")
        print("\n" + "=" * 60)
        print("Connection test FAILED")
        print("=" * 60)
        print("\nTroubleshooting:")
        print("1. Verify your DATABENTO_API_KEY is correct")
        print("2. Check you have Live API access enabled")
        print("3. Ensure network connectivity")
        print("4. Visit: https://databento.com/portal/keys")
        return False

    finally:
        if 'client' in locals():
            client.terminate()


if __name__ == '__main__':
    success = test_connection()
    sys.exit(0 if success else 1)
