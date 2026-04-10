#!/usr/bin/env python3
"""
Standalone entry point for Windows Task Scheduler
Runs daily database growth job once and exits
Can be called periodically by Windows Task Scheduler
"""

import sys
import os

# Add parent directory to path so we can import modules
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

import json
from datetime import datetime


def main():
    """Run the daily automation job."""
    try:
        from scheduler_service import scheduler_service
        
        print(f"\n{'='*70}")
        print("Windows Task Scheduler - Daily Import Job")
        print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*70}\n")
        
        # Run the daily growth job
        result = scheduler_service.daily_automated_growth()
        
        # Print summary
        print(f"\n{'='*70}")
        print("Job Summary:")
        print(f"  Status: {result.get('status', 'unknown')}".upper())
        print(f"  Records: {result.get('total_records_before')} → {result.get('total_records_after')}")
        print(f"  Discogs: +{result.get('discogs_new', 0)} new | {result.get('discogs_skipped', 0)} skipped")
        print(f"  Prices: {result.get('prices_updated', 0)} updated")
        
        if result.get('discogs_errors'):
            print(f"  Discogs Errors: {len(result['discogs_errors'])}")
        if result.get('prices_errors'):
            print(f"  Price Errors: {len(result['prices_errors'])}")
        
        print(f"Ended: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*70}\n")
        
        # Save result to file for Windows Task Scheduler monitoring
        result_file = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.last_task_result.json')
        with open(result_file, 'w', encoding='utf-8') as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        
        # Exit with appropriate code
        exit_code = 0 if result.get('status') == 'success' else 1
        sys.exit(exit_code)
    
    except ImportError as e:
        print(f"\n[ERROR] Failed to import scheduler_service: {str(e)}\n")
        sys.exit(1)
    except Exception as e:
        print(f"\n[ERROR] Job failed: {str(e)}\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
