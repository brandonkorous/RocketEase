{{- define "rocketease.labels" -}}
app.kubernetes.io/part-of: rocketease
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "rocketease.tag" -}}
{{- default .Values.updates.channel .Values.image.tag -}}
{{- end -}}

{{- define "rocketease.image.platform" -}}
{{ .Values.image.registry }}/{{ .Values.image.platform }}:{{ include "rocketease.tag" . }}
{{- end -}}
{{- define "rocketease.image.worker" -}}
{{ .Values.image.registry }}/{{ .Values.image.worker }}:{{ include "rocketease.tag" . }}
{{- end -}}
{{- define "rocketease.image.web" -}}
{{ .Values.image.registry }}/{{ .Values.image.web }}:{{ include "rocketease.tag" . }}
{{- end -}}

{{/* Env is read once at pod start; these annotations change the pod template when config or the secret revision changes. */}}
{{- define "rocketease.podAnnotations" -}}
checksum/config: {{ include (print $.Template.BasePath "/configmap.yaml") . | sha256sum }}
rocketease.works/secret-revision: {{ .Values.secrets.revision | quote }}
{{- with .Values.podAnnotations }}
{{ toYaml . }}
{{- end }}
{{- end -}}

{{- define "rocketease.envFrom" -}}
envFrom:
  - secretRef: { name: {{ .Values.secrets.existingSecret | quote }} }
  - configMapRef: { name: {{ .Release.Name }}-config }
{{- end -}}

{{- define "rocketease.podSpecCommon" -}}
{{- with .Values.image.pullSecrets }}
imagePullSecrets:
{{ toYaml . | indent 2 }}
{{- end }}
{{- with .Values.nodeSelector }}
nodeSelector:
{{ toYaml . | indent 2 }}
{{- end }}
{{- with .Values.tolerations }}
tolerations:
{{ toYaml . | indent 2 }}
{{- end }}
{{- end -}}
