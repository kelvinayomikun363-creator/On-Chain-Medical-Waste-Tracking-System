(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-INVALID-WASTE-ID u101)
(define-constant ERR-INVALID-SENDER u102)
(define-constant ERR-INVALID-RECEIVER u103)
(define-constant ERR-INVALID-TIMESTAMP u104)
(define-constant ERR-INVALID-GEO-DATA u105)
(define-constant ERR-TRANSFER-NOT-ALLOWED u106)
(define-constant ERR-WASTE-NOT-FOUND u107)
(define-constant ERR-ALREADY-DISPOSED u108)
(define-constant ERR-INVALID-METADATA u109)
(define-constant ERR-MAX-TRANSFERS-EXCEEDED u110)
(define-constant ERR-INVALID-STATUS u111)
(define-constant ERR-INVALID-TRANSFER-TYPE u112)
(define-constant ERR-INVALID-QUANTITY u113)
(define-constant ERR-INVALID-HASH u114)
(define-constant ERR-INVALID-ROLE u115)
(define-constant ERR-TRANSFER-PAUSED u116)
(define-constant ERR-INVALID-BATCH-SIZE u117)
(define-constant ERR-INVALID-EXPIRY u118)
(define-constant ERR-INVALID-SIGNATURE u119)
(define-constant ERR-INVALID-LOCATION u120)
(define-constant ERR-INVALID-CURRENCY u121)
(define-constant ERR-INVALID-FEE u122)
(define-constant ERR-INSUFFICIENT-BALANCE u123)
(define-constant ERR-INVALID-PARAM u124)
(define-constant ERR-MAX-HISTORY-EXCEEDED u125)

(define-data-var next-transfer-id uint u0)
(define-data-var max-transfers-per-waste uint u50)
(define-data-var transfer-fee uint u100)
(define-data-var paused bool false)
(define-data-var authority principal tx-sender)

(define-map waste-transfers
  uint  ;; waste-id
  (list 50
    {
      transfer-id: uint,
      sender: principal,
      receiver: principal,
      timestamp: uint,
      geo-lat: (optional int),
      geo-long: (optional int),
      metadata: (string-utf8 256),
      transfer-type: (string-ascii 32),
      quantity: uint,
      hash: (buff 32),
      status: bool,
      expiry: uint
    }
  )
)

(define-map waste-status
  uint  ;; waste-id
  {
    current-holder: principal,
    disposed: bool,
    total-transfers: uint
  }
)

(define-map authorized-roles
  principal
  (string-ascii 32)  ;; e.g., "generator", "transporter", "disposer", "regulator"
)

(define-read-only (get-transfer-history (waste-id uint))
  (map-get? waste-transfers waste-id)
)

(define-read-only (get-waste-status (waste-id uint))
  (map-get? waste-status waste-id)
)

(define-read-only (get-role (user principal))
  (map-get? authorized-roles user)
)

(define-private (validate-waste-id (id uint))
  (if (> id u0)
    (ok true)
    (err ERR-INVALID-WASTE-ID)
  )
)

(define-private (validate-principal (p principal))
  (if (not (is-eq p tx-sender))
    (ok true)
    (err ERR-INVALID-SENDER)
  )
)

(define-private (validate-timestamp (ts uint))
  (if (>= ts block-height)
    (ok true)
    (err ERR-INVALID-TIMESTAMP)
  )
)

(define-private (validate-geo (lat (optional int)) (long (optional int)))
  (match lat l1
    (match long l2
      (if (and (>= l1 -90) (<= l1 90) (>= l2 -180) (<= l2 180))
        (ok true)
        (err ERR-INVALID-GEO-DATA)
      )
      (ok true)
    )
    (ok true)
  )
)

(define-private (validate-metadata (meta (string-utf8 256)))
  (if (<= (len meta) u256)
    (ok true)
    (err ERR-INVALID-METADATA)
  )
)

(define-private (validate-transfer-type (ttype (string-ascii 32)))
  (if (or (is-eq ttype "handover") (is-eq ttype "transport") (is-eq ttype "disposal"))
    (ok true)
    (err ERR-INVALID-TRANSFER-TYPE)
  )
)

(define-private (validate-quantity (qty uint))
  (if (> qty u0)
    (ok true)
    (err ERR-INVALID-QUANTITY)
  )
)

(define-private (validate-hash (h (buff 32)))
  (if (is-eq (len h) u32)
    (ok true)
    (err ERR-INVALID-HASH)
  )
)

(define-private (validate-role (role (string-ascii 32)))
  (if (or (is-eq role "generator") (is-eq role "transporter") (is-eq role "disposer") (is-eq role "regulator"))
    (ok true)
    (err ERR-INVALID-ROLE)
  )
)

(define-private (validate-expiry (exp uint))
  (if (> exp block-height)
    (ok true)
    (err ERR-INVALID-EXPIRY)
  )
)

(define-private (is-authorized-transfer (sender principal) (receiver principal) (waste-id uint))
  (let ((sender-role (unwrap! (get-role sender) (err ERR-NOT-AUTHORIZED)))
        (receiver-role (unwrap! (get-role receiver) (err ERR-NOT-AUTHORIZED)))
        (status (unwrap! (get-waste-status waste-id) (err ERR-WASTE-NOT-FOUND))))
    (if (and (not (get disposed status)) (is-eq (get current-holder status) sender))
      (ok true)
      (err ERR-TRANSFER-NOT-ALLOWED)
    )
  )
)

(define-public (set-paused (new-paused bool))
  (begin
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (var-set paused new-paused)
    (ok true)
  )
)

(define-public (set-transfer-fee (new-fee uint))
  (begin
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (var-set transfer-fee new-fee)
    (ok true)
  )
)

(define-public (assign-role (user principal) (role (string-ascii 32)))
  (begin
    (asserts! (is-eq tx-sender (var-get authority)) (err ERR-NOT-AUTHORIZED))
    (try! (validate-role role))
    (map-set authorized-roles user role)
    (ok true)
  )
)

(define-public (initiate-transfer
  (waste-id uint)
  (receiver principal)
  (geo-lat (optional int))
  (geo-long (optional int))
  (metadata (string-utf8 256))
  (transfer-type (string-ascii 32))
  (quantity uint)
  (hash (buff 32))
  (expiry uint)
)
  (let ((transfer-id (var-get next-transfer-id))
        (status (unwrap! (get-waste-status waste-id) (err ERR-WASTE-NOT-FOUND)))
        (history (default-to (list) (map-get? waste-transfers waste-id))))
    (asserts! (not (var-get paused)) (err ERR-TRANSFER-PAUSED))
    (try! (validate-waste-id waste-id))
    (try! (validate-principal receiver))
    (try! (validate-geo geo-lat geo-long))
    (try! (validate-metadata metadata))
    (try! (validate-transfer-type transfer-type))
    (try! (validate-quantity quantity))
    (try! (validate-hash hash))
    (try! (validate-expiry expiry))
    (try! (is-authorized-transfer tx-sender receiver waste-id))
    (asserts! (< (get total-transfers status) (var-get max-transfers-per-waste)) (err ERR-MAX-TRANSFERS-EXCEEDED))
    (try! (stx-transfer? (var-get transfer-fee) tx-sender (var-get authority)))
    (let ((new-transfer
            {
              transfer-id: transfer-id,
              sender: tx-sender,
              receiver: receiver,
              timestamp: block-height,
              geo-lat: geo-lat,
              geo-long: geo-long,
              metadata: metadata,
              transfer-type: transfer-type,
              quantity: quantity,
              hash: hash,
              status: true,
              expiry: expiry
            }))
      (map-set waste-transfers waste-id (append history new-transfer))
      (map-set waste-status waste-id
        (merge status
          {
            current-holder: receiver,
            total-transfers: (+ (get total-transfers status) u1)
          }
        )
      )
      (var-set next-transfer-id (+ transfer-id u1))
      (print { event: "transfer-initiated", waste-id: waste-id, transfer-id: transfer-id })
      (ok transfer-id)
    )
  )
)

(define-public (mark-disposed (waste-id uint))
  (let ((status (unwrap! (get-waste-status waste-id) (err ERR-WASTE-NOT-FOUND))))
    (asserts! (is-eq (get current-holder status) tx-sender) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (get disposed status)) (err ERR-ALREADY-DISPOSED))
    (map-set waste-status waste-id
      (merge status { disposed: true })
    )
    (print { event: "waste-disposed", waste-id: waste-id })
    (ok true)
  )
)

(define-public (get-last-transfer (waste-id uint))
  (let ((history (default-to (list) (map-get? waste-transfers waste-id))))
    (ok (element-at? history (- (len history) u1)))
  )
)