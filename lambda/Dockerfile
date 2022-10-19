FROM node:19-alpine@sha256:88f6aa846169ea75341059f3104d6c5ebeac4be861a5adcf0489fccb55573ea7 as base

ADD ./ ./

RUN yarn --frozen-lockfile

FROM jrottenberg/ffmpeg:4.4-scratch@sha256:53103354c35b0cce609915a698df4c8d974e7d480190306e77d1b1900b04f832 as ffmpeg

FROM public.ecr.aws/lambda/nodejs:14@sha256:f27d6dd719eb33377b43c209f9354d3ecedc11c6f7d6c8af34c09413fd19034f as lambda

ENV LD_LIBRARY_PATH=/usr/local/lib:/usr/local/lib64
COPY --from=ffmpeg /bin /bin
COPY --from=ffmpeg /lib /lib
COPY --from=ffmpeg /share /share

COPY --from=base package.json yarn.lock ${LAMBDA_TASK_ROOT}
COPY --from=base node_modules/ ${LAMBDA_TASK_ROOT}/node_modules/
COPY --from=base build/ ${LAMBDA_TASK_ROOT}/build/

CMD [ "build/src/index.handler" ]
