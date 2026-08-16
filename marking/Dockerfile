# Dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/submission \
    HOME=/tmp

RUN pip install --no-cache-dir \
      pytest==8.3.4 \
      pytest-json-report==1.5.0 \
      pytest-timeout==2.3.1 \
      pyyaml==6.0.2

COPY runner/ /runner/

RUN useradd --create-home --uid 1000 runner
USER runner
WORKDIR /submission

ENTRYPOINT ["python", "-m", "pytest", "/runner/test_cases.py", \
            "-p", "no:cacheprovider", "-q", "--timeout=5", \
            "--json-report", "--json-report-file=/out/report.json"]