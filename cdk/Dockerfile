FROM node:17-alpine@sha256:959c4fc79a753b8b797c4fc9da967c7a81b4a3a3ff93d484dfe00092bf9fd584 as base

ADD ./ ./

RUN yarn --frozen-lockfile

CMD ["yarn", "cdk", "synth"]