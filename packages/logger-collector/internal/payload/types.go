package payload

// HttpLogPayload mirrors the Node collector's HttpLogPayload interface.
// All fields are optional in the request; the server applies defaults.
type HttpLogPayload struct {
	Source     *string                `json:"source"`
	Level      *string                `json:"level"`
	Namespace  *string                `json:"namespace"`
	Event      *string                `json:"event"`
	Message    *string                `json:"message"`
	Fields     map[string]interface{} `json:"fields"`
	TraceID    *string                `json:"traceId"`
	Ts         *string                `json:"ts"`
	FilePrefix *string                `json:"filePrefix"`
	FileName   *string                `json:"fileName"`
}

// JsonlLogRecord is the stored JSONL record, matching the Node collector's JsonlLogRecord interface.
type JsonlLogRecord struct {
	Ts               string      `json:"ts"`
	Seq              int64       `json:"seq"`
	Pid              int         `json:"pid"`
	Source           string      `json:"source"`
	Namespace        string      `json:"namespace"`
	Level            string      `json:"level"`
	Event            string      `json:"event,omitempty"`
	Message          string      `json:"message"`
	Fields           interface{} `json:"fields"`
	TraceID          string      `json:"traceId,omitempty"`
	FileName         string      `json:"fileName"`
	FilePath         string      `json:"filePath"`
	RelativePath     string      `json:"relativePath"`
	Line             int         `json:"line"`
	Location         string      `json:"location"`
	RelativeLocation string      `json:"relativeLocation"`
}
