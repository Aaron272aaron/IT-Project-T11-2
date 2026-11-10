# Supplied sample files

This folder keeps the original Canvas answer CSV, Word marking guide, and heading spreadsheet together. Their contents and filenames are preserved.

The preparation script at `backend/scripts/build_sample_exam.py` reads the CSV and Word guide here. Live uploads use `backend/services/csv_parser.py`; the same parser was previously named `csv import.py` in the project root.
