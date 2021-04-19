FROM node:14-alpine@sha256:ed51af876dd7932ce5c1e3b16c2e83a3f58419d824e366de1f7b00f40c848c40 as base

ADD ./ ./

RUN yarn --frozen-lockfile

FROM jrottenberg/ffmpeg:4.1-scratch@sha256:01165bc62cccae0b328ece9edc23131645979f7e9d0603c7c2a9438d00dd1c59 as ffmpeg

FROM public.ecr.aws/lambda/nodejs:14@sha256:f27d6dd719eb33377b43c209f9354d3ecedc11c6f7d6c8af34c09413fd19034f as lambda

ENV LD_LIBRARY_PATH=/usr/local/lib:/usr/local/lib64
COPY --from=ffmpeg /bin /bin
COPY --from=ffmpeg /lib /lib
COPY --from=ffmpeg /share /share

COPY --from=base package.json yarn.lock ${LAMBDA_TASK_ROOT}
COPY --from=base node_modules/ ${LAMBDA_TASK_ROOT}/node_modules/
COPY --from=base build/ ${LAMBDA_TASK_ROOT}/build/

CMD [ "build/src/index.handler" ]
